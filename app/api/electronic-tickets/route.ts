import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession, denyDemo } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { captureDenominator, captureRate, validateCapture, weekLabel } from "@/lib/electronic-tickets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Captura semanal del ticket electrónico.
 *
 * El POS no exporta, así que gerencia teclea un número por asesor y por semana.
 * El denominador (tickets totales) sale del RDV, que ya se sincroniza solo: por
 * eso se captura UN dato y no dos.
 *
 * Las semanas ofrecidas son las que de verdad existen en `Kpi` para el mes
 * retail en curso. No se inventan: el mes retail lo define el propio RDV y
 * puede cruzar meses de calendario.
 */

const saveSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Semana inválida."),
  entries: z
    .array(
      z.object({
        userId: z.string().min(1),
        crmTransactions: z.number().int().min(0).max(100000).nullable(),
        posTransactions: z.number().int().min(0).max(100000).nullable()
      })
    )
    .max(100)
});

/** Las semanas del mes retail en curso, según lo que hay sincronizado. */
async function retailMonthWeeks(storeId: string) {
  // La última semana con datos marca el mes retail vigente. Se toman esa y las
  // anteriores del mismo mes retail; como el RDV cubre un mes, un margen de
  // seis semanas hacia atrás lo abarca de sobra sin colarse en el anterior.
  const latest = await prisma.kpi.findFirst({
    where: { storeId, weekStart: { not: null } },
    orderBy: { weekStart: "desc" },
    select: { weekStart: true }
  });
  if (!latest?.weekStart) return [];

  const floor = new Date(latest.weekStart);
  floor.setUTCDate(floor.getUTCDate() - 42);

  const weeks = await prisma.kpi.findMany({
    where: { storeId, weekStart: { gte: floor } },
    distinct: ["weekStart"],
    orderBy: { weekStart: "asc" },
    select: { weekStart: true, weekEnd: true, weekNumber: true }
  });

  return weeks
    .filter((week): week is { weekStart: Date; weekEnd: Date; weekNumber: number } =>
      Boolean(week.weekStart && week.weekEnd && week.weekNumber !== null))
    .map((week) => ({
      weekStart: week.weekStart.toISOString().slice(0, 10),
      weekEnd: week.weekEnd.toISOString().slice(0, 10),
      weekNumber: week.weekNumber,
      label: weekLabel(week.weekNumber, week.weekStart, week.weekEnd)
    }));
}

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  // Es captura de gerencia: un asesor no edita el indicador con el que se le mide.
  if (session.role === "ASESOR") return NextResponse.json({ error: "No tienes permiso." }, { status: 403 });

  const weeks = await retailMonthWeeks(session.storeId);
  if (weeks.length === 0) {
    return NextResponse.json({ weeks: [], rows: {}, message: "Aún no hay semanas sincronizadas del RDV." });
  }

  const from = new Date(`${weeks[0].weekStart}T00:00:00.000Z`);
  const kpis = await prisma.kpi.findMany({
    where: { storeId: session.storeId, weekStart: { gte: from } },
    orderBy: [{ userId: "asc" }, { date: "asc" }],
    select: {
      userId: true,
      date: true,
      weekStart: true,
      transactions: true,
      crmTransactions: true,
      posTransactions: true,
      user: { select: { name: true, employeeNumber: true, active: true } }
    }
  });

  // Se agrega por (semana, asesor): los tickets del RDV se suman de los días, y
  // los capturados viven solo en la fila ancla, así que basta con quedarse con
  // el primer valor no nulo.
  type Row = {
    userId: string;
    name: string;
    employeeNumber: string;
    rdvTransactions: number;
    crmTransactions: number | null;
    posTransactions: number | null;
  };
  const byWeek = new Map<string, Map<string, Row>>();

  for (const kpi of kpis) {
    if (!kpi.weekStart || !kpi.user.active) continue;
    const weekKey = kpi.weekStart.toISOString().slice(0, 10);
    if (!byWeek.has(weekKey)) byWeek.set(weekKey, new Map());
    const week = byWeek.get(weekKey)!;
    const current = week.get(kpi.userId) ?? {
      userId: kpi.userId,
      name: kpi.user.name,
      employeeNumber: kpi.user.employeeNumber,
      rdvTransactions: 0,
      crmTransactions: null,
      posTransactions: null
    };
    current.rdvTransactions += kpi.transactions;
    if (kpi.crmTransactions !== null) current.crmTransactions = kpi.crmTransactions;
    if (kpi.posTransactions !== null) current.posTransactions = kpi.posTransactions;
    week.set(kpi.userId, current);
  }

  const rows: Record<string, (Row & { rate: number | null })[]> = {};
  for (const [weekKey, week] of byWeek) {
    rows[weekKey] = Array.from(week.values())
      .map((row) => ({ ...row, rate: captureRate(row) }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  return NextResponse.json({ weeks, rows });
}

export async function PUT(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (session.role === "ASESOR") return NextResponse.json({ error: "No tienes permiso." }, { status: 403 });
  const demo = denyDemo(session);
  if (demo) return demo;

  const parsed = await parseJson(request, saveSchema);
  if ("response" in parsed) return parsed.response;

  const weekStart = new Date(`${parsed.data.weekStart}T00:00:00.000Z`);
  if (Number.isNaN(weekStart.getTime())) {
    return NextResponse.json({ error: "Semana inválida." }, { status: 400 });
  }

  let saved = 0;
  const rejected: { name: string; reason: string }[] = [];

  for (const entry of parsed.data.entries) {
    // Las filas de ESE asesor en ESA semana, en orden: la primera es el ancla.
    const weekKpis = await prisma.kpi.findMany({
      where: { storeId: session.storeId, userId: entry.userId, weekStart },
      orderBy: { date: "asc" },
      select: { id: true, transactions: true }
    });
    if (weekKpis.length === 0) continue;

    const rdvTransactions = weekKpis.reduce((total, kpi) => total + kpi.transactions, 0);
    const issue = validateCapture({
      rdvTransactions,
      posTransactions: entry.posTransactions,
      crmTransactions: entry.crmTransactions
    });
    if (issue) {
      const user = await prisma.user.findUnique({ where: { id: entry.userId }, select: { name: true } });
      rejected.push({
        name: user?.name ?? entry.userId,
        reason:
          issue === "excede"
            ? `no puede tener más tickets electrónicos (${entry.crmTransactions}) que tickets totales (${captureDenominator({ rdvTransactions, posTransactions: entry.posTransactions, crmTransactions: entry.crmTransactions })})`
            : "el número no puede ser negativo"
      });
      continue;
    }

    // Fila ancla: ahí y solo ahí vive el total semanal. Si se repitiera en los
    // siete días, sumar la semana multiplicaría por siete.
    await prisma.$transaction(async (tx) => {
      await tx.kpi.update({
        where: { id: weekKpis[0].id },
        data: { crmTransactions: entry.crmTransactions, posTransactions: entry.posTransactions }
      });
      const restIds = weekKpis.slice(1).map((kpi) => kpi.id);
      if (restIds.length > 0) {
        await tx.kpi.updateMany({
          where: { id: { in: restIds } },
          data: { crmTransactions: null, posTransactions: null }
        });
      }
    });
    saved += 1;
  }

  if (rejected.length > 0) {
    return NextResponse.json(
      { error: `No se guardó ${rejected.map((r) => `${r.name}: ${r.reason}`).join("; ")}.`, saved },
      { status: 400 }
    );
  }

  return NextResponse.json({ saved });
}
