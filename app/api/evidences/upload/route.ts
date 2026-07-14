import { NextRequest, NextResponse } from "next/server";
import { enforceUploadRateLimit, isApiError, requireSession } from "@/lib/api";
import { serializeEvidence } from "@/lib/discussion";
import { authorizeResource, parseResourceTarget, targetWhere, validateEvidenceImage } from "@/lib/evidence";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { prisma } from "@/lib/prisma";
import { deleteFromR2, signR2Url, uploadToR2 } from "@/lib/r2";
import { evidenceCaption } from "@/lib/webhook-caption";
import { isPhotoWebhookEnabled, sendPhotoWebhook } from "@/lib/webhooks";
import { storeKey } from "@/lib/r2-keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILES = 5;

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const target = parseResourceTarget({
    pendingId: request.nextUrl.searchParams.get("pendingId") ?? undefined,
    taskId: request.nextUrl.searchParams.get("taskId") ?? undefined,
    logEntryId: request.nextUrl.searchParams.get("logEntryId") ?? undefined
  });
  if (!target) return NextResponse.json({ error: "Indica exactamente un recurso." }, { status: 400 });
  if (!await authorizeResource(prisma, session, target)) return NextResponse.json({ error: "Recurso no encontrado o sin permiso." }, { status: 404 });
  const evidences = await prisma.evidence.findMany({
    where: { storeId: session.storeId, ...targetWhere(target) },
    include: { uploadedBy: { select: { name: true, photoUrl: true } } },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({ evidences: evidences.map(serializeEvidence) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const limited = await enforceUploadRateLimit(session.userId);
  if (limited) return limited;
  const form = await request.formData().catch(() => null);

  const rawFiles = form?.getAll("files") ?? [];
  const files = rawFiles.filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "Selecciona al menos una imagen." }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Máximo ${MAX_FILES} fotos por evidencia.` }, { status: 400 });

  const target = parseResourceTarget({
    pendingId: form?.get("pendingId")?.toString(),
    taskId: form?.get("taskId")?.toString(),
    logEntryId: form?.get("logEntryId")?.toString()
  });
  if (!target) return NextResponse.json({ error: "Indica exactamente un recurso." }, { status: 400 });
  const resource = await authorizeResource(prisma, session, target);
  if (!resource) return NextResponse.json({ error: "Recurso no encontrado o sin permiso." }, { status: 404 });
  const note = form?.get("note")?.toString().trim() ?? "";
  if (note.length > 500) return NextResponse.json({ error: "La nota no puede superar 500 caracteres." }, { status: 400 });

  // Validate all files before uploading anything
  const validated: Array<{ file: File; bytes: Uint8Array; extension: string }> = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateEvidenceImage(file, bytes);
    if (!validation.valid) return NextResponse.json({ error: `${file.name}: ${validation.error}` }, { status: 400 });
    validated.push({ file, bytes, extension: validation.extension });
  }

  // Upload sequentially — track URLs so we can roll back on DB failure
  const uploaded: Array<{ url: string; file: File }> = [];
  try {
    for (const { file, bytes, extension } of validated) {
      const key = storeKey(session.storeId, "evidences", `${session.userId}-${Date.now()}-${crypto.randomUUID()}.${extension}`);
      const url = await uploadToR2(key, bytes, file.type);
      uploaded.push({ url, file });
    }
  } catch (error) {
    await Promise.allSettled(uploaded.map(({ url }) => deleteFromR2(url)));
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo subir la imagen." }, { status: 500 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const created = await Promise.all(
        uploaded.map(({ url, file }) =>
          tx.evidence.create({
            data: {
              storeId: session.storeId,
              uploadedById: session.userId,
              ...targetWhere(target),
              url,
              fileName: file.name.slice(0, 255),
              mimeType: file.type,
              note: note || null
            },
            include: { uploadedBy: { select: { name: true, photoUrl: true } } }
          })
        )
      );
      const recipients = new Set<string>();
      if (resource.recipientId !== session.userId) recipients.add(resource.recipientId);
      if (resource.kind === "task" || resource.kind === "pending") {
        const managers = await tx.user.findMany({ where: { storeId: session.storeId, role: { in: ["GERENTE", "SUBGERENTE"] }, id: { not: session.userId } }, select: { id: true } });
        managers.forEach((m) => recipients.add(m.id));
      }
      const recipientList = Array.from(recipients);
      await createNotifications(tx, recipientList.map((userId) => ({
        storeId: session.storeId,
        userId,
        type: "EVIDENCE_ADDED" as const,
        title: "Nueva evidencia",
        body: resource.title
      })));
      return { created, recipientList };
    });

    const evidenceUrl = resource.kind === "announcement" ? "/comunicados" : resource.kind === "task" ? "/plan" : resource.kind === "logEntry" ? "/bitacora" : "/pendientes";
    dispatchPushToUsers(result.recipientList, { title: "📎 Nueva evidencia", body: `${session.name} subió evidencia en "${resource.title}"`, tag: "evidencia", url: evidenceUrl }).catch(() => undefined);

    // Se devuelve firmada para que la UI la pinte al instante sin recargar.
    const signedUrls = await Promise.all(result.created.map((evidence) => signR2Url(evidence.url)));

    // Aviso a n8n → canal de Telegram. Fire-and-forget: si n8n está caído, la
    // evidencia YA quedó guardada. No se rompe una subida por una notificación.
    if (isPhotoWebhookEnabled(session.storeId)) {
      void (async () => {
        const store = await prisma.store.findUnique({ where: { id: session.storeId }, select: { name: true } });
        // 6 h: le da margen a n8n para reintentar si estaba caído al momento.
        const urls = await Promise.all(result.created.map((evidence) => signR2Url(evidence.url, 6 * 60 * 60)));
        await Promise.all(result.created.map((evidence, index) => sendPhotoWebhook({
          type: "evidence",
          storeId: session.storeId,
          storeName: store?.name ?? "Tienda",
          caption: evidenceCaption({
            storeName: store?.name ?? "Tienda",
            uploaderName: session.name,
            employeeNumber: session.employeeNumber,
            resourceKind: resource.kind,
            resourceTitle: resource.title,
            note: evidence.note,
            createdAt: evidence.createdAt
          }),
          imageUrl: urls[index] ?? evidence.url,
          fileName: evidence.fileName,
          createdAt: evidence.createdAt.toISOString()
        })));
      })().catch(() => undefined);
    }

    return NextResponse.json({
      evidences: result.created.map((evidence, index) => ({ ...serializeEvidence(evidence), url: signedUrls[index] ?? evidence.url }))
    }, { status: 201 });
  } catch (error) {
    await Promise.allSettled(uploaded.map(({ url }) => deleteFromR2(url)));
    return NextResponse.json({ error: "No se pudo guardar la evidencia." }, { status: 500 });
  }
}
