import { NextResponse } from "next/server";
import { z } from "zod";
import { DATA_SOURCE_ROLES } from "@/lib/access-control";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { isChecklistKind, isChecklistSection } from "@/lib/checklist";
import { loadStoreChecklistItems } from "@/lib/checklist-store";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Puntos del checklist para EDITAR (con id para renombrar/quitar). Solo gerencia. */
export async function GET() {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;
  await loadStoreChecklistItems(session.storeId); // siembra los de por defecto si es la primera vez
  const items = await prisma.checklistItem.findMany({
    where: { storeId: session.storeId, active: true },
    orderBy: [{ section: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, key: true, section: true, kind: true, label: true, sortOrder: true }
  });
  return NextResponse.json({ items });
}

const createSchema = z.object({
  section: z.string(),
  kind: z.string(),
  label: z.string().trim().min(2).max(120)
});

function slugify(label: string): string {
  return label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
}

export async function POST(request: Request) {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, createSchema);
  if ("response" in parsed) return parsed.response;
  const { section, kind, label } = parsed.data;
  if (!isChecklistSection(section) || !isChecklistKind(kind)) {
    return NextResponse.json({ error: "Sección o tipo inválido." }, { status: 400 });
  }

  // key único por tienda (choca también contra puntos desactivados, para no revivir uno viejo).
  const base = slugify(label);
  let key = base;
  for (let i = 2; await prisma.checklistItem.findUnique({ where: { storeId_key: { storeId: session.storeId, key } }, select: { id: true } }); i += 1) {
    key = `${base}-${i}`;
  }
  const max = await prisma.checklistItem.aggregate({ where: { storeId: session.storeId, section }, _max: { sortOrder: true } });
  const item = await prisma.checklistItem.create({
    data: { storeId: session.storeId, key, section, kind, label, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    select: { id: true, key: true, section: true, kind: true, label: true, sortOrder: true }
  });
  return NextResponse.json({ item }, { status: 201 });
}
