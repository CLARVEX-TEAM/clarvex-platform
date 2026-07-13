import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceUploadRateLimit, isApiError, parseJson, requireSession } from "@/lib/api";
import { createAnnouncement } from "@/lib/services/announcement-service";
import { validateProfilePhoto } from "@/lib/profile-photo";
import { deleteFromR2, uploadToR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const textSchema = z.object({ title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(2000) });

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const limited = await enforceUploadRateLimit(session.userId);
  if (limited) return limited;

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

  const announcement = await createAnnouncement(session, { title, body, imageUrl }).catch(async (error) => {
    if (imageUrl) deleteFromR2(imageUrl).catch(() => undefined);
    throw error;
  });

  return NextResponse.json({ announcement }, { status: 201 });
}
