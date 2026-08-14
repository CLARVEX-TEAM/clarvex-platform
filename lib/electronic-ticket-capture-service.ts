import { captureDenominator, captureRate, validateCapture, weekLabel } from "@/lib/electronic-tickets";
import { prisma } from "@/lib/prisma";

export type ElectronicTicketCaptureRow = {
  userId: string;
  name: string;
  employeeNumber: string;
  rdvTransactions: number;
  crmTransactions: number | null;
  posTransactions: number | null;
};

export type ElectronicTicketCaptureWeek = {
  weekStart: string;
  weekEnd: string;
  weekNumber: number;
  label: string;
};

export type ElectronicTicketCapturePayload = {
  weeks: ElectronicTicketCaptureWeek[];
  rows: Record<string, Array<ElectronicTicketCaptureRow & { rate: number | null }>>;
  message?: string;
};

export type ElectronicTicketSaveEntry = {
  userId: string;
  crmTransactions: number | null;
  posTransactions: number | null;
};

export async function loadElectronicTicketCapture(storeId: string): Promise<ElectronicTicketCapturePayload> {
  const latest = await prisma.kpi.findFirst({
    where: { storeId },
    orderBy: { date: "desc" },
    select: { date: true }
  });
  if (!latest) {
    return { weeks: [], rows: {}, message: "Aún no hay KPIs capturados para esta tienda." };
  }

  // Seis semanas cubren el mes retail vigente, incluso cuando cruza meses de
  // calendario. Los KPIs ya llegan desde Retool; no dependen del antiguo RDV.
  const floor = new Date(latest.date);
  floor.setUTCDate(floor.getUTCDate() - 42);

  const kpis = await prisma.kpi.findMany({
    where: { storeId, date: { gte: floor }, weekNumber: { not: null } },
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
  const byWeek = new Map<number, Map<string, ElectronicTicketCaptureRow>>();

  for (const kpi of kpis) {
    if (kpi.weekNumber === null) continue;

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
    // Los valores capturados viven solo en la primera fila de la semana.
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

  const rows: ElectronicTicketCapturePayload["rows"] = {};
  for (const [weekNumber, week] of byWeek) {
    rows[String(weekNumber)] = Array.from(week.values())
      .map((row) => ({ ...row, rate: captureRate(row) }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  return { weeks, rows };
}

export async function saveElectronicTicketCapture(
  storeId: string,
  weekNumber: number,
  entries: ElectronicTicketSaveEntry[]
): Promise<{ saved: number; rejected: Array<{ name: string; reason: string }> }> {
  let saved = 0;
  const rejected: Array<{ name: string; reason: string }> = [];

  for (const entry of entries) {
    const weekKpis = await prisma.kpi.findMany({
      where: { storeId, userId: entry.userId, weekNumber },
      orderBy: { date: "asc" },
      select: { id: true, transactions: true, user: { select: { name: true } } }
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
      rejected.push({
        name: weekKpis[0].user.name,
        reason:
          issue === "excede"
            ? `tiene más tickets electrónicos (${entry.crmTransactions}) que tickets totales (${captureDenominator(candidate)})`
            : "el número no puede ser negativo"
      });
      continue;
    }

    // Patrón de fila ancla: el total semanal se escribe una sola vez. El
    // denominador queda congelado para que el reporte mensual incluya solo las
    // semanas que sí fueron medidas.
    const denominator = entry.crmTransactions === null ? null : entry.posTransactions ?? rdvTransactions;
    await prisma.$transaction(async (tx) => {
      await tx.kpi.update({
        where: { id: weekKpis[0].id },
        data: { crmTransactions: entry.crmTransactions, posTransactions: denominator }
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

  return { saved, rejected };
}
