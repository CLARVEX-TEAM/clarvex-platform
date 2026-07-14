import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { mergeWithDefaults, type UniformDay } from "@/lib/uniforms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET — la tabla de la semana + el equipo con su variante asignada.
 *
 * Si la tienda no ha guardado su tabla, se devuelven los valores por defecto
 * (lib/uniforms). La primera edición crea sus filas.
 */
export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";

  const [saved, users] = await Promise.all([
    prisma.uniformDay.findMany({ where: { storeId: session.storeId }, orderBy: { weekday: "asc" } }),
    prisma.user.findMany({
      where: { storeId: session.storeId, active: true },
      select: { id: true, name: true, photoUrl: true, uniformVariant: true },
      orderBy: [{ role: "asc" }, { name: "asc" }]
    })
  ]);

  const days: UniformDay[] = mergeWithDefaults(saved.map((row) => ({
    weekday: row.weekday,
    womanTop: row.womanTop,
    womanBottom: row.womanBottom,
    manTop: row.manTop,
    manBottom: row.manBottom,
    note: row.note
  })));

  return NextResponse.json({
    canEdit: manager,
    days,
    users,
    myVariant: users.find((user) => user.id === session.userId)?.uniformVariant ?? null
  }, { headers: { "Cache-Control": "private, no-store" } });
}

const daySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  womanTop: z.string().trim().min(1).max(80),
  womanBottom: z.string().trim().min(1).max(80),
  manTop: z.string().trim().min(1).max(80),
  manBottom: z.string().trim().min(1).max(80),
  note: z.string().trim().max(200).nullable().optional()
});

const putSchema = z.object({
  days: z.array(daySchema).max(7).optional(),
  /// Variante de uniforme por colaborador (MUJER | HOMBRE).
  variants: z.array(z.object({
    userId: z.string().min(1),
    variant: z.enum(["MUJER", "HOMBRE"]).nullable()
  })).max(50).optional()
});

/** PUT — gerencia edita la tabla y/o asigna la variante de cada quien. */
export async function PUT(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, putSchema);
  if ("response" in parsed) return parsed.response;
  const { days, variants } = parsed.data;

  if (days?.length) {
    await Promise.all(days.map((day) => prisma.uniformDay.upsert({
      where: { storeId_weekday: { storeId: session.storeId, weekday: day.weekday } },
      update: { ...day, note: day.note ?? null },
      create: { storeId: session.storeId, ...day, note: day.note ?? null }
    })));
  }

  if (variants?.length) {
    // Solo colaboradores de ESTA tienda (no se toca a nadie de otra).
    const ids = new Set((await prisma.user.findMany({
      where: { storeId: session.storeId, id: { in: variants.map((row) => row.userId) } },
      select: { id: true }
    })).map((user) => user.id));

    await Promise.all(variants
      .filter((row) => ids.has(row.userId))
      .map((row) => prisma.user.update({ where: { id: row.userId }, data: { uniformVariant: row.variant } })));
  }

  await recordAudit({
    session,
    action: "uniforms.update",
    entity: "UniformDay",
    storeId: session.storeId,
    detail: `${days?.length ?? 0} día(s), ${variants?.length ?? 0} variante(s)`
  });

  return NextResponse.json({ ok: true });
}
