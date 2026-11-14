import { ADVISOR_WHERE } from "@/lib/store-people";
import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { NotificationType } from "@prisma/client";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { tiendasParaCierreBuenFin } from "@/lib/cierre-buen-fin";
import { buildLowPerformanceManagerSummary } from "@/lib/daily-summary";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { avisar } from "@/lib/whatsapp-canal";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUSH_TAG = "bajo-desempeno";
const LOG_TYPE = "LOW_PERF";
const WINDOW_DAYS = 3; // ventana de días con datos a revisar
const MIN_DAYS = 2; // días laborados mínimos dentro de la ventana para considerar "sostenido"
const THRESHOLD = 0.7; // por debajo del 70% de la meta del día = bajo

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const ahora = new Date();
  const fecha = resolveMonterreyDate(ahora);
  const { dateKey, utcDate } = fecha;
  const thresholdPct = Math.round(THRESHOLD * 100);
  const stores = await prisma.store.findMany({
    where: tiendasParaCierreBuenFin("desempeno", fecha, ahora),
    select: { id: true }
  });

  const summary = {
    date: dateKey,
    stores: stores.length,
    advisorsFlagged: 0,
    managersNotified: 0,
    storesAlerted: 0
  };

  for (const store of stores) {
    // Últimos días con datos (ignorando filas futuras pre-cargadas en el RDV).
    const recentDates = await prisma.kpi.findMany({
      where: { storeId: store.id, date: { lte: utcDate } },
      distinct: ["date"],
      select: { date: true },
      orderBy: { date: "desc" },
      take: WINDOW_DAYS
    });
    if (recentDates.length < MIN_DAYS) continue;
    const windowDates = recentDates.map((row) => row.date);

    const [managers, rows, sentLogs] = await Promise.all([
      prisma.user.findMany({ where: { storeId: store.id, role: { in: ["GERENTE", "SUBGERENTE"] } }, select: { id: true } }),
      prisma.kpi.findMany({
        where: { storeId: store.id, date: { in: windowDates }, user: ADVISOR_WHERE },
        select: { userId: true, dailySales: true, dailyGoal: true, user: { select: { name: true } } }
      }),
      prisma.dailyNotificationLog.findMany({ where: { date: dateKey, type: LOG_TYPE }, select: { employeeId: true } })
    ]);
    const alreadySent = new Set(sentLogs.map((log) => log.employeeId));

    // Agrupa por asesor; solo cuentan días con meta del día (>0).
    const byAdvisor = new Map<string, { name: string; pcts: number[] }>();
    for (const row of rows) {
      const goal = Number(row.dailyGoal);
      if (goal <= 0) continue;
      const pct = Number(row.dailySales) / goal;
      const entry = byAdvisor.get(row.userId) ?? { name: row.user.name, pcts: [] };
      entry.pcts.push(pct);
      byAdvisor.set(row.userId, entry);
    }

    const flagged: Array<{ name: string; daysBelow: number; avgPct: number }> = [];
    for (const entry of Array.from(byAdvisor.values())) {
      if (entry.pcts.length < MIN_DAYS) continue;
      if (!entry.pcts.every((pct) => pct < THRESHOLD)) continue;
      const avgPct = Math.round((entry.pcts.reduce((total, pct) => total + pct, 0) / entry.pcts.length) * 100);
      flagged.push({ name: entry.name, daysBelow: entry.pcts.length, avgPct });
    }
    if (flagged.length === 0) continue;
    flagged.sort((left, right) => left.avgPct - right.avgPct);
    summary.advisorsFlagged += flagged.length;

    const managerIds = managers.map((manager) => manager.id).filter((id) => !alreadySent.has(id));
    if (managerIds.length === 0) continue;

    const message = buildLowPerformanceManagerSummary({ windowDays: windowDates.length, thresholdPct, flagged });
    const notifications: NotificationInput[] = managerIds.map((id) => ({ storeId: store.id, userId: id, type: NotificationType.DAILY_SUMMARY, title: message.title, body: message.body }));

    await prisma.$transaction(async (tx) => {
      await createNotifications(tx, notifications);
      await tx.dailyNotificationLog.createMany({
        data: managerIds.map((id) => ({ employeeId: id, date: dateKey, type: LOG_TYPE, case: null, sent: true })),
        skipDuplicates: true
      });
    });

    await avisar(managerIds, { title: message.title, body: message.body, tag: PUSH_TAG, url: "/kpis" }).catch(() => undefined);
    summary.managersNotified += managerIds.length;
    summary.storesAlerted += 1;
  }

  return NextResponse.json(summary);
}
