import { NextResponse } from "next/server";
import { z } from "zod";
import { canUseChecklist } from "@/lib/access-control";
import { enforceUploadRateLimit, isApiError, parseJson, requireSession } from "@/lib/api";
import { CHECKLIST_ITEMS, findChecklistItem } from "@/lib/checklist";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";
import { validateProfilePhoto } from "@/lib/profile-photo";
import { signR2Url, uploadToR2 } from "@/lib/r2";
import { storeKey } from "@/lib/r2-keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveDate(value: string | null): string {
  return value && DATE_RE.test(value) ? value : resolveMonterreyDate().dateKey;
}

type EntryRow = { itemKey: string; completed: boolean; note: string | null; evidenceUrl: string | null; completedBy: string | null; completedAt: Date | null };
type ScanRow = { id: string; itemKey: string; url: string; fileName: string | null; createdAt: Date };

async function serialize(date: string, entries: EntryRow[], scans: ScanRow[]) {
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
    items: CHECKLIST_ITEMS.map((def) => {
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
  const [entries, scans] = await Promise.all([
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
  return serialize(date, entries, scans);
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
      const key = storeKey(session.storeId, "checklist", `${itemKey}-${Date.now()}.${validation.extension}`);
      try {
        evidenceUrl = await uploadToR2(key, bytes, imageFile.type);
      } catch {
        return NextResponse.json({ error: "No se pudo subir la evidencia." }, { status: 500 });
      }
    }
  } else {
    const parsed = await parseJson(request, jsonSchema);
    if ("response" in parsed) return parsed.response;
    itemKey = parsed.data.itemKey;
    completed = parsed.data.completed;
    note = parsed.data.note ?? null;
    date = resolveDate(parsed.data.date ?? null);
  }

  const def = findChecklistItem(itemKey);
  if (!def) return NextResponse.json({ error: "Item de checklist no válido." }, { status: 400 });

  const base = {
    section: def.section,
    completed,
    note,
    completedBy: completed ? session.userId : null,
    completedAt: completed ? new Date() : null,
    ...(evidenceUrl ? { evidenceUrl } : {})
  };

  await prisma.checklistEntry.upsert({
    where: { storeId_date_itemKey: { storeId: session.storeId, date, itemKey } },
    update: base,
    create: { storeId: session.storeId, date, itemKey, ...base }
  });

  return NextResponse.json(await loadChecklist(session.storeId, date));
}
