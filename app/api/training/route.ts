import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { isTrainingCategory } from "@/lib/training";
import { validateEvidenceImage } from "@/lib/evidence";
import { prisma } from "@/lib/prisma";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { deleteFromR2, uploadToR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PDF_BYTES = 10 * 1024 * 1024;

function isPdf(bytes: Uint8Array) {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const manager = session.role !== "ASESOR";

  const [resources, advisorCount] = await Promise.all([
    prisma.trainingResource.findMany({
      where: { storeId: session.storeId },
      include: { author: { select: { name: true } }, views: { include: { user: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.user.count({ where: { storeId: session.storeId, role: "ASESOR" } })
  ]);

  return NextResponse.json({
    advisorCount,
    resources: resources.map((resource) => ({
      id: resource.id,
      title: resource.title,
      description: resource.description,
      category: resource.category,
      linkUrl: resource.linkUrl,
      fileUrl: resource.fileUrl,
      fileName: resource.fileName,
      author: resource.author.name,
      createdAt: resource.createdAt.toISOString(),
      viewedByMe: resource.views.some((view) => view.userId === session.userId),
      viewCount: resource.views.length,
      viewers: manager ? resource.views.map((view) => ({ id: view.user.id, name: view.user.name })) : undefined
    }))
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const form = await request.formData().catch(() => null);
  const title = form?.get("title")?.toString().trim() ?? "";
  const description = form?.get("description")?.toString().trim() ?? "";
  const category = form?.get("category")?.toString().trim() ?? "";
  const linkUrl = form?.get("linkUrl")?.toString().trim() ?? "";
  if (title.length < 2 || title.length > 160) return NextResponse.json({ error: "Indica un título (2-160 caracteres)." }, { status: 400 });
  if (!isTrainingCategory(category)) return NextResponse.json({ error: "Categoría inválida." }, { status: 400 });
  if (description.length > 1000) return NextResponse.json({ error: "La descripción es muy larga." }, { status: 400 });
  if (linkUrl && !/^https?:\/\/.+/i.test(linkUrl)) return NextResponse.json({ error: "El enlace debe iniciar con http(s)://" }, { status: 400 });

  const rawFile = form?.get("file");
  const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;
  if (!file && !linkUrl) return NextResponse.json({ error: "Agrega un enlace o un archivo." }, { status: 400 });

  let fileUrl: string | null = null;
  let fileName: string | null = null;
  if (file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (file.type === "application/pdf" || isPdf(bytes)) {
      if (bytes.byteLength > MAX_PDF_BYTES) return NextResponse.json({ error: "El PDF debe pesar menos de 10 MB." }, { status: 400 });
      try {
        const key = `training/${session.userId}-${Date.now()}-${crypto.randomUUID()}.pdf`;
        fileUrl = await uploadToR2(key, bytes, "application/pdf");
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo subir el archivo." }, { status: 500 });
      }
    } else {
      const validation = validateEvidenceImage(file, bytes);
      if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });
      try {
        const key = `training/${session.userId}-${Date.now()}-${crypto.randomUUID()}.${validation.extension}`;
        fileUrl = await uploadToR2(key, bytes, file.type);
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo subir el archivo." }, { status: 500 });
      }
    }
    fileName = file.name.slice(0, 255);
  }

  try {
    const { resource, advisorIds } = await prisma.$transaction(async (tx) => {
      const created = await tx.trainingResource.create({
        data: { storeId: session.storeId, authorId: session.userId, title, description: description || null, category, linkUrl: linkUrl || null, fileUrl, fileName },
        include: { author: { select: { name: true } } }
      });
      const advisors = await tx.user.findMany({ where: { storeId: session.storeId, role: "ASESOR" }, select: { id: true } });
      await createNotifications(tx, advisors.map((advisor) => ({
        storeId: session.storeId,
        userId: advisor.id,
        type: "NEW_TRAINING" as const,
        title: "Nueva capacitación",
        body: created.title
      })));
      return { resource: created, advisorIds: advisors.map((advisor) => advisor.id) };
    });

    dispatchPushToUsers(advisorIds, { title: "Nueva capacitación", body: resource.title, tag: "capacitacion" }).catch(() => undefined);

    return NextResponse.json({
      resource: {
        id: resource.id, title: resource.title, description: resource.description, category: resource.category,
        linkUrl: resource.linkUrl, fileUrl: resource.fileUrl, fileName: resource.fileName, author: resource.author.name,
        createdAt: resource.createdAt.toISOString(), viewedByMe: false, viewCount: 0, viewers: []
      }
    }, { status: 201 });
  } catch (error) {
    if (fileUrl) await deleteFromR2(fileUrl).catch(() => undefined);
    return NextResponse.json({ error: "No se pudo guardar el recurso." }, { status: 500 });
  }
}
