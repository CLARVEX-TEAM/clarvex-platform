import { NextResponse } from "next/server";
import { z } from "zod";
import { DATA_SOURCE_ROLES } from "@/lib/access-control";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({
  label: z.string().trim().min(2).max(120).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional()
});

/** Renombrar o reordenar un punto del checklist. Solo gerencia. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;
  const { id } = await params;
  const parsed = await parseJson(request, patchSchema);
  if ("response" in parsed) return parsed.response;

  const item = await prisma.checklistItem.findFirst({ where: { id, storeId: session.storeId }, select: { id: true } });
  if (!item) return NextResponse.json({ error: "Punto no encontrado." }, { status: 404 });

  const data: { label?: string; sortOrder?: number } = {};
  if (parsed.data.label !== undefined) data.label = parsed.data.label;
  if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });

  await prisma.checklistItem.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

/** Quitar un punto: se DESACTIVA (no se borra) para no perder el histórico. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;
  const { id } = await params;

  const item = await prisma.checklistItem.findFirst({ where: { id, storeId: session.storeId }, select: { id: true } });
  if (!item) return NextResponse.json({ error: "Punto no encontrado." }, { status: 404 });

  await prisma.checklistItem.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
