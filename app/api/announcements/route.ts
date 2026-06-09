import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { validateProfilePhoto } from "@/lib/profile-photo";
import { deleteFromR2, uploadToR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const textSchema = z.object({ title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(2000) });

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const contentType = request.headers.get("content-type") ?? "";
  let title: string;
  let body: string;
  let imageUrl: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Formulario invalido." }, { status: 400 });

    const parsed = textSchema.safeParse({ title: form.get("title"), body: form.get("body") });
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos invalidos." }, { status: 400 });
    title = parsed.data.title;
    body = parsed.data.body;

    const imageFile = form.get("image");
    if (imageFile instanceof File && imageFile.size > 0) {
      const bytes = new Uint8Array(await imageFile.arrayBuffer());
      const validation = validateProfilePhoto(imageFile, bytes);
      if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });
      const key = `announcements/${session.userId}-${Date.now()}.${validation.extension}`;
      try {
        imageUrl = await uploadToR2(key, bytes, imageFile.type);
      } catch {
        return NextResponse.json({ error: "No se pudo subir la imagen." }, { status: 500 });
      }
    }
  } else {
    const parsed = await parseJson(request, textSchema);
    if ("response" in parsed) return parsed.response;
    title = parsed.data.title;
    body = parsed.data.body;
  }

  const { announcement, advisorIds } = await prisma.$transaction(async (tx) => {
    const created = await tx.announcement.create({
      data: { storeId: session.storeId, authorId: session.userId, title, body, imageUrl },
      include: { reads: true }
    });
    const advisors = await tx.user.findMany({ where: { storeId: session.storeId, role: "ASESOR" }, select: { id: true } });
    await createNotifications(tx, advisors.map((advisor) => ({
      storeId: session.storeId,
      userId: advisor.id,
      type: "NEW_ANNOUNCEMENT" as const,
      title: "Nuevo comunicado",
      body: created.title
    })));
    return { announcement: created, advisorIds: advisors.map((advisor) => advisor.id) };
  }).catch(async (error) => {
    if (imageUrl) deleteFromR2(imageUrl).catch(() => undefined);
    throw error;
  });

  dispatchPushToUsers(advisorIds, { title: "Nuevo comunicado", body: announcement.title, tag: "comunicado" }).catch(() => undefined);
  return NextResponse.json({
    announcement: {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      imageUrl: announcement.imageUrl ?? null,
      authorId: announcement.authorId,
      date: announcement.createdAt.toISOString().slice(0, 10),
      readBy: []
    }
  }, { status: 201 });
}
