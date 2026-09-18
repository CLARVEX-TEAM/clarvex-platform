import { NextResponse } from "next/server";
import { z } from "zod";
import { canUseChecklist } from "@/lib/access-control";
import { createHash } from "node:crypto";
import { enforceUploadRateLimit, isApiError, parseJson, requireSession } from "@/lib/api";
import { claveDeLaPeticion, conIdempotencia } from "@/lib/idempotencia-db";
import { getStoreChecklistItem, loadStoreChecklistItems, type StoreChecklistItem } from "@/lib/checklist-store";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";
import { validateProfilePhoto } from "@/lib/profile-photo";
import { signR2Url, uploadToR2 } from "@/lib/r2";
import { storeKey } from "@/lib/r2-keys";
import { checklistEvidenceCaption } from "@/lib/webhook-caption";
import { isPhotoWebhookEnabled, sendPhotoWebhook } from "@/lib/webhooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveDate(value: string | null): string {
  return value && DATE_RE.test(value) ? value : resolveMonterreyDate().dateKey;
}

type EntryRow = { itemKey: string; completed: boolean; note: string | null; evidenceUrl: string | null; completedBy: string | null; completedAt: Date | null };
type ScanRow = { id: string; itemKey: string; url: string; fileName: string | null; createdAt: Date };

async function serialize(date: string, defs: StoreChecklistItem[], entries: EntryRow[], scans: ScanRow[]) {
  const byKey = new Map(entries.map((entry) => [entry.itemKey, entry]));
  // Las evidencias del checklist viven en R2 (bucket privado) → URL firmada.
  const signed = new Map(
    await Promise.all(entries.map(async (entry) => [entry.itemKey, await signR2Url(entry.evidenceUrl)] as const))
  );
  // Fotos de escaneo por ítem, firmadas y ordenadas por subida.
  const signedScans = await Promise.all(scans.map(async (scan) => ({
    id: scan.id, itemKey: scan.itemKey, fileName: scan.fileName, url: await signR2Url(scan.url) ?? scan.url, createdAt: scan.createdAt.toISOString()
  })));
  const scansByKey = new Map<string, typeof signedScans>();
  for (const scan of signedScans) {
    const list = scansByKey.get(scan.itemKey) ?? [];
    list.push(scan);
    scansByKey.set(scan.itemKey, list);
  }
  return {
    date,
    items: defs.map((def) => {
      const entry = byKey.get(def.key);
      return {
        key: def.key,
        label: def.label,
        section: def.section,
        kind: def.kind,
        completed: entry?.completed ?? false,
        note: entry?.note ?? null,
        evidenceUrl: signed.get(def.key) ?? null,
        completedBy: entry?.completedBy ?? null,
        completedAt: entry?.completedAt?.toISOString() ?? null,
        scans: def.kind === "scan" ? (scansByKey.get(def.key) ?? []) : []
      };
    })
  };
}

async function loadChecklist(storeId: string, date: string) {
  const [defs, entries, scans] = await Promise.all([
    loadStoreChecklistItems(storeId),
    prisma.checklistEntry.findMany({
      where: { storeId, date },
      select: { itemKey: true, completed: true, note: true, evidenceUrl: true, completedBy: true, completedAt: true }
    }),
    prisma.checklistScan.findMany({
      where: { storeId, date },
      select: { id: true, itemKey: true, url: true, fileName: true, createdAt: true },
      orderBy: { createdAt: "asc" }
    })
  ]);
  return serialize(date, defs, entries, scans);
}

export async function GET(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (!canUseChecklist(session)) return NextResponse.json({ error: "No tienes permiso." }, { status: 403 });

  const date = resolveDate(new URL(request.url).searchParams.get("date"));
  return NextResponse.json(await loadChecklist(session.storeId, date));
}

const jsonSchema = z.object({
  itemKey: z.string().min(1),
  completed: z.boolean(),
  note: z.string().trim().max(500).optional(),
  date: z.string().regex(DATE_RE).optional()
});

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (!canUseChecklist(session)) return NextResponse.json({ error: "No tienes permiso." }, { status: 403 });
  const limited = await enforceUploadRateLimit(session.userId);
  if (limited) return limited;

  const contentType = request.headers.get("content-type") ?? "";
  let itemKey: string;
  let completed: boolean;
  let note: string | null = null;
  let date: string;
  let evidenceUrl: string | undefined;
  /** La evidencia ya validada, todavía sin subir. */
  let imagen: { bytes: Uint8Array; tipo: string; extension: string } | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Formulario invalido." }, { status: 400 });
    itemKey = String(form.get("itemKey") ?? "");
    completed = String(form.get("completed") ?? "") === "true";
    const rawNote = form.get("note");
    note = typeof rawNote === "string" && rawNote.trim() ? rawNote.trim().slice(0, 500) : null;
    date = resolveDate(typeof form.get("date") === "string" ? String(form.get("date")) : null);

    const imageFile = form.get("image");
    if (imageFile instanceof File && imageFile.size > 0) {
      const bytes = new Uint8Array(await imageFile.arrayBuffer());
      const validation = validateProfilePhoto(imageFile, bytes);
      if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });
      /*
       * ⚠️ Aquí solo se VALIDA; la subida ocurre dentro de la guarda de
       * idempotencia, más abajo. Subiendo aquí, un reintento dejaría un objeto
       * nuevo en R2 --el nombre lleva `Date.now()`-- antes de que nadie pudiera
       * darse cuenta de que es el mismo intento. La guarda no serviría de nada.
       */
      imagen = { bytes, tipo: imageFile.type, extension: validation.extension };
    }
  } else {
    const parsed = await parseJson(request, jsonSchema);
    if ("response" in parsed) return parsed.response;
    itemKey = parsed.data.itemKey;
    completed = parsed.data.completed;
    note = parsed.data.note ?? null;
    date = resolveDate(parsed.data.date ?? null);
  }

  const def = await getStoreChecklistItem(session.storeId, itemKey);
  if (!def) return NextResponse.json({ error: "Item de checklist no válido." }, { status: 400 });

  /*
   * ⚠️ Desde aquí hasta la respuesta va dentro de la guarda de idempotencia,
   * SUBIDA INCLUIDA.
   *
   * Marcar la tarea es inofensivo de repetir --el upsert escribe lo mismo-- pero
   * la evidencia no: cada intento crearía un objeto nuevo en R2 y otra fila. Es
   * justo lo que hará una cola sin conexión al reintentar desde la tienda.
   *
   * Sin cabecera `Idempotency-Key` todo se comporta igual que antes: la guarda
   * se AÑADE a quien la pide y no se le impone a lo que ya funciona.
   */
  /*
   * ⚠️ Se capturan aquí y no dentro: en una función anidada TypeScript pierde
   * el estrechamiento que dieron `isApiError` y la comprobación de `def`,
   * porque el cierre podría llamarse más tarde.
   */
  const sesion = session;
  const definicion = def;
  const huellaImagen = imagen ? createHash("sha256").update(imagen.bytes).digest("hex") : null;
  const resultado = await conIdempotencia(
    {
      clave: claveDeLaPeticion(request),
      storeId: session.storeId,
      userId: session.userId,
      route: "/api/checklist",
      cuerpo: { itemKey, completed, note, date, huellaImagen }
    },
    async () => guardarChecklist()
  );
  return NextResponse.json(resultado.body, { status: resultado.status });

  async function guardarChecklist(): Promise<{ status: number; body: unknown }> {
  if (imagen) {
    const key = storeKey(sesion.storeId, "checklist", `${itemKey}-${Date.now()}.${imagen.extension}`);
    try {
      evidenceUrl = await uploadToR2(key, imagen.bytes, imagen.tipo);
    } catch {
      return { status: 500, body: { error: "No se pudo subir la evidencia." } };
    }
  }

  const base = {
    section: definicion.section,
    completed,
    note,
    completedBy: completed ? sesion.userId : null,
    completedAt: completed ? new Date() : null,
    ...(evidenceUrl ? { evidenceUrl } : {})
  };

  await prisma.checklistEntry.upsert({
    where: { storeId_date_itemKey: { storeId: sesion.storeId, date, itemKey } },
    update: base,
    create: { storeId: sesion.storeId, date, itemKey, ...base }
  });

  // Si se subió foto de evidencia, avísale al canal de Telegram (igual que las
  // evidencias de pendientes/faltantes). Fire-and-forget: la evidencia YA quedó
  // guardada; que n8n esté caído no rompe la subida.
  if (evidenceUrl && isPhotoWebhookEnabled(sesion.storeId)) {
    const capturedUrl = evidenceUrl;
    const item = definicion.label.replace(/^Escanear\s+/i, "");
    const capturedNote = note;
    const createdAt = new Date();
    void (async () => {
      const store = await prisma.store.findUnique({ where: { id: sesion.storeId }, select: { name: true } });
      const signed = await signR2Url(capturedUrl, 6 * 60 * 60);
      await sendPhotoWebhook({
        type: "checklist",
        format: "photo",
        storeId: sesion.storeId,
        storeName: store?.name ?? "Tienda",
        caption: checklistEvidenceCaption({
          storeName: store?.name ?? "Tienda",
          uploaderName: sesion.name,
          employeeNumber: sesion.employeeNumber,
          item,
          note: capturedNote,
          createdAt
        }),
        imageUrl: signed ?? capturedUrl,
        fileName: `${item} ${date}.jpg`,
        createdAt: createdAt.toISOString()
      });
    })().catch(() => undefined);
  }

    return { status: 200, body: await loadChecklist(sesion.storeId, date) };
  }
}
