import { NextResponse } from "next/server";
import { DATA_SOURCE_ROLES } from "@/lib/access-control";
import { enforceUploadRateLimit, isApiError, requireSession } from "@/lib/api";
import { findChecklistItem, isScanItem } from "@/lib/checklist";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";
import { validateProfilePhoto } from "@/lib/profile-photo";
import { deleteFromR2, signR2Url, uploadToR2 } from "@/lib/r2";
import { storeKey } from "@/lib/r2-keys";
import { checklistScanCaption } from "@/lib/webhook-caption";
import { isPhotoWebhookEnabled, sendPhotoWebhook } from "@/lib/webhooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveDate(value: string | null): string {
  return value && DATE_RE.test(value) ? value : resolveMonterreyDate().dateKey;
}

/** Sube UNA foto de un escaneo del cierre. Se pueden subir varias por documento. */
export async function POST(request: Request) {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;
  const limited = await enforceUploadRateLimit(session.userId);
  if (limited) return limited;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Formulario inválido." }, { status: 400 });

  const itemKey = String(form.get("itemKey") ?? "");
  const def = findChecklistItem(itemKey);
  if (!def || !isScanItem(itemKey)) return NextResponse.json({ error: "Ítem de escaneo no válido." }, { status: 400 });
  const date = resolveDate(typeof form.get("date") === "string" ? String(form.get("date")) : null);

  const imageFile = form.get("image");
  if (!(imageFile instanceof File) || imageFile.size === 0) {
    return NextResponse.json({ error: "Adjunta una foto." }, { status: 400 });
  }
  const bytes = new Uint8Array(await imageFile.arrayBuffer());
  const validation = validateProfilePhoto(imageFile, bytes);
  if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });

  const key = storeKey(session.storeId, "checklist", `${itemKey}-${Date.now()}.${validation.extension}`);
  let url: string;
  try {
    url = await uploadToR2(key, bytes, imageFile.type);
  } catch {
    return NextResponse.json({ error: "No se pudo subir la foto." }, { status: 500 });
  }

  let scan;
  try {
    scan = await prisma.checklistScan.create({
      data: { storeId: session.storeId, date, itemKey, url, fileName: imageFile.name.slice(0, 255), uploadedById: session.userId }
    });
  } catch (error) {
    await deleteFromR2(url).catch(() => undefined);
    throw error;
  }

  // Al canal de Telegram, para descargarla y subirla a Checklist Fácil. El
  // documento se identifica en el pie de foto. Fire-and-forget: si n8n está
  // caído, el escaneo YA quedó guardado en la app.
  if (isPhotoWebhookEnabled(session.storeId)) {
    void (async () => {
      const store = await prisma.store.findUnique({ where: { id: session.storeId }, select: { name: true } });
      const signed = await signR2Url(url, 6 * 60 * 60);
      await sendPhotoWebhook({
        type: "checklist",
        storeId: session.storeId,
        storeName: store?.name ?? "Tienda",
        caption: checklistScanCaption({
          storeName: store?.name ?? "Tienda",
          uploaderName: session.name,
          employeeNumber: session.employeeNumber,
          // "Escanear corte de caja" → "Corte de caja".
          document: def.label.replace(/^Escanear\s+/i, ""),
          createdAt: scan.createdAt
        }),
        imageUrl: signed ?? url,
        fileName: scan.fileName,
        createdAt: scan.createdAt.toISOString()
      });
    })().catch(() => undefined);
  }

  return NextResponse.json({
    scan: { id: scan.id, itemKey: scan.itemKey, fileName: scan.fileName, url: await signR2Url(url) ?? url, createdAt: scan.createdAt.toISOString() }
  }, { status: 201 });
}

/** Borra una foto de escaneo (una equivocada). No afecta a Telegram: ya se envió. */
export async function DELETE(request: Request) {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });

  // Solo de la propia tienda (no se borra el escaneo de otra).
  const scan = await prisma.checklistScan.findFirst({ where: { id, storeId: session.storeId } });
  if (!scan) return NextResponse.json({ error: "Escaneo no encontrado." }, { status: 404 });

  await prisma.checklistScan.delete({ where: { id: scan.id } });
  await deleteFromR2(scan.url).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
