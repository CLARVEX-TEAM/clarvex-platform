import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, isApiError, parseJson } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET — catálogo de marbetes de la tienda (todos los roles: se usa al contar).
export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const tags = await prisma.cycleCountTag.findMany({
    where: { storeId: session.storeId },
    orderBy: [{ zone: "asc" }, { number: "asc" }]
  });
  return NextResponse.json({ tags });
}

const upsertSchema = z.object({
  // Alta por rango: "Piso 1–60" en una sola llamada.
  ranges: z.array(z.object({
    zone: z.enum(["PISO", "BODEGA"]),
    from: z.number().int().min(1).max(99999),
    to: z.number().int().min(1).max(99999)
  })).max(20).optional(),
  // Cambios individuales (etiqueta / activar / desactivar).
  updates: z.array(z.object({
    id: z.string(),
    label: z.string().max(60).nullable().optional(),
    active: z.boolean().optional(),
    zone: z.enum(["PISO", "BODEGA"]).optional()
  })).max(400).optional()
});

// POST — gerencia administra el catálogo (rangos nuevos y ediciones).
export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, upsertSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  let created = 0;
  for (const range of body.ranges ?? []) {
    if (range.to < range.from || range.to - range.from > 2000) {
      return NextResponse.json({ error: "Rango de marbetes inválido." }, { status: 400 });
    }
    const numbers = Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i);
    const result = await prisma.cycleCountTag.createMany({
      data: numbers.map((number) => ({ storeId: session.storeId, number, zone: range.zone })),
      skipDuplicates: true
    });
    created += result.count;
  }

  for (const update of body.updates ?? []) {
    await prisma.cycleCountTag.updateMany({
      where: { id: update.id, storeId: session.storeId },
      data: {
        ...(update.label !== undefined ? { label: update.label?.trim() || null } : {}),
        ...(update.active !== undefined ? { active: update.active } : {}),
        ...(update.zone !== undefined ? { zone: update.zone } : {})
      }
    });
  }

  if (created > 0) {
    await recordAudit({
      session,
      storeId: session.storeId,
      action: "cyclecount.tags",
      entity: "CycleCountTag",
      detail: `${created} marbetes dados de alta`
    });
  }

  const tags = await prisma.cycleCountTag.findMany({
    where: { storeId: session.storeId },
    orderBy: [{ zone: "asc" }, { number: "asc" }]
  });
  return NextResponse.json({ tags, created });
}
