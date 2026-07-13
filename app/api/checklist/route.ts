import { NextResponse } from "next/server";
import { z } from "zod";
import { DATA_SOURCE_ROLES } from "@/lib/access-control";
import { enforceUploadRateLimit, isApiError, parseJson, requireSession } from "@/lib/api";
import { CHECKLIST_ITEMS, findChecklistItem } from "@/lib/checklist";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";
import { validateProfilePhoto } from "@/lib/profile-photo";
import { signR2Url, uploadToR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveDate(value: string | null): string {
  return value && DATE_RE.test(value) ? value : resolveMonterreyDate().dateKey;
}

type EntryRow = { itemKey: string; completed: boolean; note: string | null; evidenceUrl: string | null; completedBy: string | null; completedAt: Date | null };

async function serialize(date: string, entries: EntryRow[]) {
  const byKey = new Map(entries.map((entry) => [entry.itemKey, entry]));
  // Las evidencias del checklist viven en R2 (bucket privado) → URL firmada.
  const signed = new Map(
    await Promise.all(entries.map(async (entry) => [entry.itemKey, await signR2Url(entry.evidenceUrl)] as const))
  );
  return {
    date,
    items: CHECKLIST_ITEMS.map((def) => {
      const entry = byKey.get(def.key);
      return {
        key: def.key,
        label: def.label,
        section: def.section,
        completed: entry?.completed ?? false,
        note: entry?.note ?? null,
        evidenceUrl: signed.get(def.key) ?? null,
        completedBy: entry?.completedBy ?? null,
        completedAt: entry?.completedAt?.toISOString() ?? null
      };
    })
  };
}

export async function GET(request: Request) {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;

  const date = resolveDate(new URL(request.url).searchParams.get("date"));
  const entries = await prisma.checklistEntry.findMany({
    where: { storeId: session.storeId, date },
    select: { itemKey: true, completed: true, note: true, evidenceUrl: true, completedBy: true, completedAt: true }
  });
  return NextResponse.json(await serialize(date, entries));
}

const jsonSchema = z.object({
  itemKey: z.string().min(1),
  completed: z.boolean(),
  note: z.string().trim().max(500).optional(),
  date: z.string().regex(DATE_RE).optional()
});

export async function POST(request: Request) {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;
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
      const key = `checklist/${session.storeId}-${itemKey}-${Date.now()}.${validation.extension}`;
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

  const entries = await prisma.checklistEntry.findMany({
    where: { storeId: session.storeId, date },
    select: { itemKey: true, completed: true, note: true, evidenceUrl: true, completedBy: true, completedAt: true }
  });
  return NextResponse.json(await serialize(date, entries));
}
