import { NextResponse } from "next/server";
import { z } from "zod";
import { canUseChecklist } from "@/lib/access-control";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { getStoreChecklistItem } from "@/lib/checklist-store";
import { scanDocumentLabel, scanPdfFileName } from "@/lib/checklist-scan";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";
import { deleteFromR2, signR2Url, uploadToR2 } from "@/lib/r2";
import { storeKey } from "@/lib/r2-keys";
import { buildScanPdf } from "@/lib/scan-pdf";
import { checklistScanCaption } from "@/lib/webhook-caption";
import { isPhotoWebhookEnabled, sendPhotoWebhook } from "@/lib/webhooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  itemKey: z.string().min(1),
  date: z.string().regex(DATE_RE).optional()
});

/**
 * Junta las páginas escaneadas de un documento del cierre en UN PDF, lo guarda y
 * lo manda al canal de Telegram como DOCUMENTO (no foto), para descargarlo y
 * subirlo a Checklist Fácil.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (!canUseChecklist(session)) return NextResponse.json({ error: "No tienes permiso." }, { status: 403 });

  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const { itemKey } = parsed.data;
  const def = await getStoreChecklistItem(session.storeId, itemKey);
  if (!def || def.kind !== "scan") return NextResponse.json({ error: "Ítem de escaneo no válido." }, { status: 400 });
  const date = parsed.data.date && DATE_RE.test(parsed.data.date) ? parsed.data.date : resolveMonterreyDate().dateKey;

  const scans = await prisma.checklistScan.findMany({
    where: { storeId: session.storeId, date, itemKey },
    orderBy: { createdAt: "asc" },
    select: { url: true }
  });
  if (scans.length === 0) return NextResponse.json({ error: "No hay páginas escaneadas para este documento." }, { status: 400 });

  // Las páginas viven en R2 (bucket privado): se bajan con URL firmada de vida
  // corta. El servidor arma el PDF y no expone las imágenes.
  let images: Uint8Array[];
  try {
    images = await Promise.all(scans.map(async (scan) => {
      const signed = await signR2Url(scan.url, 300);
      const response = await fetch(signed ?? scan.url);
      if (!response.ok) throw new Error(`No se pudo leer una página (${response.status}).`);
      return new Uint8Array(await response.arrayBuffer());
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron leer las páginas." }, { status: 500 });
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildScanPdf(images);
  } catch {
    return NextResponse.json({ error: "No se pudo armar el PDF (¿alguna imagen dañada?)." }, { status: 500 });
  }

  const key = storeKey(session.storeId, "checklist", `${itemKey}-${date}-${Date.now()}.pdf`);
  let pdfUrl: string;
  try {
    pdfUrl = await uploadToR2(key, pdfBytes, "application/pdf");
  } catch {
    return NextResponse.json({ error: "No se pudo guardar el PDF." }, { status: 500 });
  }

  const createdAt = new Date();
  // Al canal de Telegram como DOCUMENTO (PDF), no foto. Fire-and-forget: si n8n
  // está caído, el PDF YA quedó en R2 y se puede reintentar generándolo de nuevo.
  if (isPhotoWebhookEnabled(session.storeId)) {
    void (async () => {
      const store = await prisma.store.findUnique({ where: { id: session.storeId }, select: { name: true } });
      const storeName = store?.name ?? "Tienda";
      const signed = await signR2Url(pdfUrl, 6 * 60 * 60);
      await sendPhotoWebhook({
        type: "checklist",
        format: "document",
        storeId: session.storeId,
        storeName,
        caption: checklistScanCaption({
          storeName,
          uploaderName: session.name,
          employeeNumber: session.employeeNumber,
          document: scanDocumentLabel(def.label),
          createdAt
        }),
        imageUrl: signed ?? pdfUrl,
        fileName: scanPdfFileName(def.label, storeName, date),
        createdAt: createdAt.toISOString()
      });
    })().catch(() => undefined);
  }

  return NextResponse.json({
    pdfUrl: await signR2Url(pdfUrl) ?? pdfUrl,
    pages: scans.length,
    sentToTelegram: isPhotoWebhookEnabled(session.storeId)
  }, { status: 201 });
}
