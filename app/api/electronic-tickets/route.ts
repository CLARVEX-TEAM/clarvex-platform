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
 * ⚠️ SE AGRUPA POR `weekNumber`, NUNCA POR `weekStart`.
 *
 * En esta base `weekStart` y `weekEnd` valen lo mismo que `date` en cada fila:
 * no son los límites de la semana pese al nombre. Agrupar por `weekStart`
 * produciría una "semana" por día. `weekNumber` sí es correcto y constante, y
 * es lo que ya usa la sincronización del margen DTO (data-source-sync.ts:584).
 * Los límites reales se derivan del mínimo y máximo `date` de cada grupo.
 */

const saveSchema = z.object({
  weekNumber: z.number().int().min(1).max(53),
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

type Row = {
  userId: string;
  name: string;
  employeeNumber: string;
  rdvTransactions: number;
  crmTransactions: number | null;
  posTransactions: number | null;
};

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  // Es captura de gerencia: un asesor no edita el indicador con el que se le mide.
  if (session.role === "ASESOR") return NextResponse.json({ error: "No tienes permiso." }, { status: 403 });

  const latest = await prisma.kpi.findFirst({
    where: { storeId: session.storeId },
    orderBy: { date: "desc" },
    select: { date: true }
  });
  if (!latest) {
    return NextResponse.json({ weeks: [], rows: {}, message: "Aún no hay datos sincronizados del RDV." });
  }

  // Seis semanas hacia atrás: cubre de sobra el mes retail en curso, que el RDV
  // define y puede cruzar meses de calendario.
  const floor = new Date(latest.date);
  floor.setUTCDate(floor.getUTCDate() - 42);

  const kpis = await prisma.kpi.findMany({
    where: { storeId: session.storeId, date: { gte: floor }, weekNumber: { not: null } },
    orderBy: { date: "asc" },
    select: {
      userId: true,
      date: true,
      weekNumber: true,
      transactions: true,
      crmTransactions: true,
      posTransactions: true,
      user: { select: { name: true, employeeNumber: true, active: true } }
    }
  });

  const weekBounds = new Map<number, { start: Date; end: Date }>();
  const byWeek = new Map<number, Map<string, Row>>();

  for (const kpi of kpis) {
    if (kpi.weekNumber === null) continue;

    // Los límites reales de la semana salen de las fechas presentes, porque los
    // campos weekStart/weekEnd no los contienen (ver el aviso de arriba).
    const bounds = weekBounds.get(kpi.weekNumber);
    if (!bounds) weekBounds.set(kpi.weekNumber, { start: kpi.date, end: kpi.date });
    else {
      if (kpi.date < bounds.start) bounds.start = kpi.date;
      if (kpi.date > bounds.end) bounds.end = kpi.date;
    }

    if (!kpi.user.active) continue;
    if (!byWeek.has(kpi.weekNumber)) byWeek.set(kpi.weekNumber, new Map());
    const week = byWeek.get(kpi.weekNumber)!;
    const current = week.get(kpi.userId) ?? {
      userId: kpi.userId,
      name: kpi.user.name,
      employeeNumber: kpi.user.employeeNumber,
      rdvTransactions: 0,
      crmTransactions: null,
      posTransactions: null
    };
    current.rdvTransactions += kpi.transactions;
    // Los capturados viven solo en la fila ancla: basta el primer valor no nulo.
    if (kpi.crmTransactions !== null) current.crmTransactions = kpi.crmTransactions;
    if (kpi.posTransactions !== null) current.posTransactions = kpi.posTransactions;
    week.set(kpi.userId, current);
  }

  const weeks = Array.from(weekBounds.entries())
    .sort((a, b) => a[1].start.getTime() - b[1].start.getTime())
    .map(([weekNumber, bounds]) => ({
      weekNumber,
      weekStart: bounds.start.toISOString().slice(0, 10),
      weekEnd: bounds.end.toISOString().slice(0, 10),
      label: weekLabel(weekNumber, bounds.start, bounds.end)
    }));

  const rows: Record<string, (Row & { rate: number | null })[]> = {};
  for (const [weekNumber, week] of byWeek) {
    rows[String(weekNumber)] = Array.from(week.values())
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

  const { weekNumber } = parsed.data;
  let saved = 0;
  const rejected: { name: string; reason: string }[] = [];

  for (const entry of parsed.data.entries) {
    // Las filas de ESE asesor en ESA semana, en orden: la primera es el ancla.
    const weekKpis = await prisma.kpi.findMany({
      where: { storeId: session.storeId, userId: entry.userId, weekNumber },
      orderBy: { date: "asc" },
      select: { id: true, transactions: true }
    });
    if (weekKpis.length === 0) continue;

    const rdvTransactions = weekKpis.reduce((total, kpi) => total + kpi.transactions, 0);
    const candidate = {
      rdvTransactions,
      posTransactions: entry.posTransactions,
      crmTransactions: entry.crmTransactions
    };
    const issue = validateCapture(candidate);
    if (issue) {
      const user = await prisma.user.findUnique({ where: { id: entry.userId }, select: { name: true } });
      rejected.push({
        name: user?.name ?? entry.userId,
        reason:
          issue === "excede"
            ? `tiene más tickets electrónicos (${entry.crmTransactions}) que tickets totales (${captureDenominator(candidate)})`
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
      { error: `No se guardó — ${rejected.map((r) => `${r.name} ${r.reason}`).join("; ")}.`, saved },
      { status: 400 }
    );
  }

  return NextResponse.json({ saved });
}
