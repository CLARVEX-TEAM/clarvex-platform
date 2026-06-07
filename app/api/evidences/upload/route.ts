import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { serializeEvidence } from "@/lib/discussion";
import { authorizeResource, parseResourceTarget, targetWhere, validateEvidenceImage } from "@/lib/evidence";
import { createNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecciona una imagen." }, { status: 400 });
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
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateEvidenceImage(file, bytes);
  if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });

  const directory = path.join(process.cwd(), "public", "uploads", "evidences");
  await mkdir(directory, { recursive: true });
  const fileName = `${session.userId}-${Date.now()}-${crypto.randomUUID()}.${validation.extension}`;
  const destination = path.join(directory, fileName);
  await writeFile(destination, bytes, { flag: "wx" });

  try {
    const evidence = await prisma.$transaction(async (tx) => {
      const created = await tx.evidence.create({
        data: {
          storeId: session.storeId,
          uploadedById: session.userId,
          ...targetWhere(target),
          url: `/uploads/evidences/${fileName}`,
          fileName: file.name.slice(0, 255),
          mimeType: file.type,
          note: note || null
        },
        include: { uploadedBy: { select: { name: true, photoUrl: true } } }
      });
      const recipients = new Set<string>();
      if (resource.recipientId !== session.userId) recipients.add(resource.recipientId);
      if (resource.kind === "task") {
        const managers = await tx.user.findMany({ where: { storeId: session.storeId, role: { in: ["GERENTE", "SUBGERENTE"] }, id: { not: session.userId } }, select: { id: true } });
        managers.forEach((manager) => recipients.add(manager.id));
      }
      await createNotifications(tx, Array.from(recipients).map((userId) => ({
        storeId: session.storeId,
        userId,
        type: "EVIDENCE_ADDED" as const,
        title: "Nueva evidencia",
        body: resource.title
      })));
      return created;
    });
    return NextResponse.json({ evidence: serializeEvidence(evidence) }, { status: 201 });
  } catch (error) {
    await unlink(destination).catch(() => undefined);
    console.error("Error al guardar evidencia", error);
    return NextResponse.json({ error: "No se pudo guardar la evidencia." }, { status: 500 });
  }
}
