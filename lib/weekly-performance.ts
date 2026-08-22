import { Prisma } from "@prisma/client";
import { calculateFairQuota, type FairQuotaPerson, type FairQuotaResult } from "@/lib/fair-quota";
import { aggregateKpis, aggregateStore, aggregateStoreTraffic, type KpiReportItem } from "@/lib/kpi-report";
import { recalculateMonths } from "@/lib/kpi-capture";
import { prisma } from "@/lib/prisma";
import { reconstructRdvWeek } from "@/lib/rdv-week";
import { PERSON_WHERE } from "@/lib/store-people";
import { buildWeeklyCloseColumn, buildWeeklyCloseColumns, type WeeklyCloseColumn } from "@/lib/weekly-close";
import { buildWorkingScheduleKeys } from "@/lib/working-days";

const DAY_MS = 86_400_000;
const TEAM_ROLES = ["GERENTE", "SUBGERENTE", "ASESOR"] as const;

export type WeeklyPerformancePlan = {
  minimums: Record<string, number>;
  percentages?: Record<string, Record<string, number>>;
  upliftPercent: number;
  whatsappBudget: number;
};

export type WeeklyPerformanceState = {
  store: { id: string; name: string };
  week: { weekNumber: number; weekStart: string; weekEnd: string; dates: string[] };
  status: "NEW" | "DRAFT" | "FINALIZED";
  recordId: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
  plan: WeeklyPerformancePlan;
  quota: FairQuotaResult;
  schedules: Record<string, Record<string, string>>;
  report: { columns: WeeklyCloseColumn[]; store: WeeklyCloseColumn };
  history: Array<{ weekStart: string; weekEnd: string; weekNumber: number; status: "DRAFT" | "FINALIZED"; updatedAt: string }>;
};

export type SaveWeeklyPerformanceInput = {
  minimums: Record<string, number>;
  percentages?: Record<string, Record<string, number>>;
  upliftPercent?: number;
  whatsappBudget?: number;
  action: "draft" | "finalize";
  note?: string;
};

export async function getWeeklyPerformance(storeId: string, requestedDate: Date): Promise<WeeklyPerformanceState> {
  const week = reconstructRdvWeek(requestedDate);
  const dates = weekDates(week.weekStart);
  const [store, people, schedules, saved, history, rows, whatsappTarget] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { storeId, ...PERSON_WHERE, role: { in: [...TEAM_ROLES] } },
      select: { id: true, name: true, role: true, photoUrl: true },
      orderBy: [{ role: "asc" }, { name: "asc" }]
    }),
    prisma.schedule.findMany({
      where: { storeId, date: { gte: week.weekStart, lte: week.weekEnd } },
      select: { userId: true, date: true, status: true, statusRaw: true }
    }),
    prisma.weeklyPerformanceClose.findUnique({ where: { storeId_weekStart: { storeId, weekStart: week.weekStart } } }),
    prisma.weeklyPerformanceClose.findMany({
      where: { storeId }, orderBy: { weekStart: "desc" }, take: 12,
      select: { weekStart: true, weekEnd: true, weekNumber: true, status: true, updatedAt: true }
    }),
    prisma.kpi.findMany({
      where: { storeId, date: { gte: week.weekStart, lte: week.weekEnd } },
      include: { user: { select: { name: true, role: true, photoUrl: true } } },
      orderBy: [{ date: "asc" }, { userId: "asc" }]
    }),
    prisma.kpiTarget.findUnique({
      where: { storeId_metric_period: { storeId, metric: "whatsapp", period: "SEMANA" } },
      select: { value: true }
    })
  ]);
  if (!store) throw new Error("Tienda no encontrada.");
  const historyView = history.map((item) => ({
    weekStart: dayKey(item.weekStart), weekEnd: dayKey(item.weekEnd), weekNumber: item.weekNumber,
    status: item.status, updatedAt: item.updatedAt.toISOString()
  }));
  const frozen = saved?.status === "FINALIZED" ? readSnapshot(saved.snapshot) : null;
  if (frozen) {
    return {
      ...frozen,
      status: "FINALIZED",
      recordId: saved!.id,
      finalizedAt: saved!.finalizedAt?.toISOString() ?? frozen.finalizedAt,
      finalizedBy: saved!.finalizedBy ?? frozen.finalizedBy,
      history: historyView
    };
  }

  const team: FairQuotaPerson[] = people.map((person) => ({
    userId: person.id, name: person.name, role: person.role as FairQuotaPerson["role"], photoUrl: person.photoUrl
  }));
  const scheduleGrid = buildScheduleGrid(team, dates, schedules);
  const presence = Object.fromEntries(dates.map((date) => [
    date,
    team.filter((person) => isWorkingStatus(scheduleGrid[person.userId]?.[date])).map((person) => person.userId)
  ]));
  const savedPlan = readPlan(saved?.plan);
  const plan: WeeklyPerformancePlan = savedPlan ?? {
    minimums: deriveMinimums(dates, rows),
    upliftPercent: 15,
    whatsappBudget: whatsappTarget ? Number(whatsappTarget.value) : 0
  };
  const quota = calculateFairQuota({ dates, people: team, presence, ...plan });
  const workingKeys = buildWorkingScheduleKeys(schedules);
  const report = buildReport(rows, people, quota, workingKeys);

  return {
    store,
    week: { weekNumber: week.weekNumber, weekStart: dates[0], weekEnd: dates[6], dates },
    status: saved?.status ?? "NEW",
    recordId: saved?.id ?? null,
    finalizedAt: saved?.finalizedAt?.toISOString() ?? null,
    finalizedBy: saved?.finalizedBy ?? null,
    plan,
    quota,
    schedules: scheduleGrid,
    report,
    history: historyView
  };
}

export async function saveWeeklyPerformance(
  storeId: string,
  requestedDate: Date,
  input: SaveWeeklyPerformanceInput,
  actor: string
): Promise<WeeklyPerformanceState> {
  const week = reconstructRdvWeek(requestedDate);
  const current = await prisma.weeklyPerformanceClose.findUnique({
    where: { storeId_weekStart: { storeId, weekStart: week.weekStart } }, select: { status: true }
  });
  if (current?.status === "FINALIZED") throw new Error("Este cierre ya fue finalizado y no admite cambios.");

  const preview = await getWeeklyPerformance(storeId, requestedDate);
  const plan: WeeklyPerformancePlan = {
    minimums: input.minimums,
    percentages: input.percentages,
    upliftPercent: input.upliftPercent ?? 15,
    whatsappBudget: input.whatsappBudget ?? 0
  };
  const presence = Object.fromEntries(preview.week.dates.map((date) => [
    date,
    preview.quota.days[0]?.allocations
      .filter((person) => isWorkingStatus(preview.schedules[person.userId]?.[date]))
      .map((person) => person.userId) ?? []
  ]));
  const quota = calculateFairQuota({
    dates: preview.week.dates,
    people: preview.quota.days[0]?.allocations.map(({ userId, name, role, photoUrl }) => ({ userId, name, role, photoUrl })) ?? [],
    presence,
    ...plan
  });
  const goalRows = quota.days.flatMap((day) => day.allocations.map((person) => ({
    userId: person.userId, date: new Date(`${day.date}T00:00:00.000Z`), dailyGoal: person.goal
  })));
  const planJson = plan as unknown as Prisma.InputJsonValue;

  await prisma.$transaction(async (tx) => {
    for (const row of goalRows) {
      const rdv = reconstructRdvWeek(row.date);
      await tx.kpi.upsert({
        where: { userId_date: { userId: row.userId, date: row.date } },
        update: { dailyGoal: row.dailyGoal },
        create: {
          userId: row.userId, storeId, date: row.date, dailyGoal: row.dailyGoal,
          weekNumber: rdv.weekNumber, weekStart: rdv.weekStart, weekEnd: rdv.weekEnd,
          dailySales: 0, transactions: 0, pieces: 0, upt: 0, avgTicket: 0,
          ranking: 0, monthlySales: 0, monthlyGoal: 0
        }
      });
    }
    await tx.weeklyPerformanceClose.upsert({
      where: { storeId_weekStart: { storeId, weekStart: week.weekStart } },
      update: {
        weekEnd: week.weekEnd, weekNumber: week.weekNumber, upliftPercent: plan.upliftPercent,
        whatsappBudget: plan.whatsappBudget, plan: planJson, note: input.note?.trim() || null, updatedBy: actor
      },
      create: {
        storeId, weekStart: week.weekStart, weekEnd: week.weekEnd, weekNumber: week.weekNumber,
        upliftPercent: plan.upliftPercent, whatsappBudget: plan.whatsappBudget, plan: planJson,
        note: input.note?.trim() || null, createdBy: actor, updatedBy: actor
      }
    });
    await tx.kpiTarget.upsert({
      where: { storeId_metric_period: { storeId, metric: "whatsapp", period: "SEMANA" } },
      update: { value: plan.whatsappBudget },
      create: { storeId, metric: "whatsapp", period: "SEMANA", value: plan.whatsappBudget, createdBy: actor }
    });
  });
  await recalculateMonths(storeId, goalRows.map(({ userId, date }) => ({ userId, date })));

  const refreshed = await getWeeklyPerformance(storeId, requestedDate);
  if (input.action === "finalize") {
    const finalizedAt = new Date();
    const snapshot: WeeklyPerformanceState = {
      ...refreshed, status: "FINALIZED", finalizedAt: finalizedAt.toISOString(), finalizedBy: actor
    };
    await prisma.weeklyPerformanceClose.update({
      where: { storeId_weekStart: { storeId, weekStart: week.weekStart } },
      data: {
        status: "FINALIZED", finalizedAt, finalizedBy: actor,
        snapshot: snapshot as unknown as Prisma.InputJsonValue, updatedBy: actor
      }
    });
    return getWeeklyPerformance(storeId, requestedDate);
  }
  return refreshed;
}

function buildScheduleGrid(
  people: FairQuotaPerson[],
  dates: string[],
  schedules: Array<{ userId: string; date: Date; status: string; statusRaw: string | null }>
) {
  const grid: Record<string, Record<string, string>> = Object.fromEntries(
    people.map((person) => [person.userId, Object.fromEntries(dates.map((date) => [date, "OFF"]))])
  );
  for (const schedule of schedules) {
    const date = dayKey(schedule.date);
    if (grid[schedule.userId]?.[date] !== undefined) grid[schedule.userId][date] = schedule.status;
  }
  return grid;
}

function buildReport(
  rows: Parameters<typeof aggregateKpis>[0],
  people: Array<{ id: string; name: string; role: string; photoUrl: string | null }>,
  quota: FairQuotaResult,
  workingKeys: Set<string>
) {
  const reports = aggregateKpis(rows, false, workingKeys);
  const withData = new Set(reports.map((item) => item.userId));
  const full: KpiReportItem[] = [
    ...reports,
    ...people.filter((person) => !withData.has(person.id)).map((person) => zeroReport(person, quota.personTotals[person.id]?.goal ?? 0))
  ];
  const store = aggregateStore(
    full,
    aggregateStoreTraffic(rows.filter((row): row is typeof row & { date: Date } => row.date instanceof Date))
  ) ?? zeroReport({ id: "store", name: "Tienda", role: "GERENTE", photoUrl: null }, quota.storeTotal);
  const wa = new Map(Object.entries(quota.personTotals).map(([id, totals]) => [id, totals.whatsappGoal]));
  return {
    columns: buildWeeklyCloseColumns(full, store, quota.whatsappBudget, wa),
    store: buildWeeklyCloseColumn(store, store, quota.whatsappBudget)
  };
}

function zeroReport(person: { id: string; name: string; role: string; photoUrl: string | null }, goal: number): KpiReportItem {
  return {
    userId: person.id, userName: person.name, role: person.role as KpiReportItem["role"],
    avatar: person.name.slice(0, 2).toUpperCase(), photoUrl: person.photoUrl,
    sales: 0, goal, achievement: 0, transactions: 0, pieces: 0, upt: null, aur: null, ept: null,
    conversion: null, traffic: null, ranking: 0, grossSales: null, orkestraSales: null,
    orkestraTransactions: null, orkestraPieces: null, crmTransactions: null, posTransactions: null,
    discountAmount: null, discountMargin: null, discountLimit: null, commissionAmount: 0,
    commissionPercent: 0, commissionMinimum: null
  };
}

function readPlan(value: unknown): WeeklyPerformancePlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!item.minimums || typeof item.minimums !== "object") return null;
  return {
    minimums: numberRecord(item.minimums),
    percentages: item.percentages && typeof item.percentages === "object"
      ? Object.fromEntries(Object.entries(item.percentages as Record<string, unknown>).map(([date, percentages]) => [date, numberRecord(percentages)]))
      : undefined,
    upliftPercent: numberOr(item.upliftPercent, 15),
    whatsappBudget: numberOr(item.whatsappBudget, 0)
  };
}

function readSnapshot(value: unknown): WeeklyPerformanceState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<WeeklyPerformanceState>;
  return item.store && item.week && item.plan && item.quota && item.report ? item as WeeklyPerformanceState : null;
}

function numberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, numberOr(item, 0)]));
}
function deriveMinimums(dates: string[], rows: Array<{ date: Date; dailyGoal: unknown }>) {
  const goals = new Map<string, number>();
  for (const row of rows) {
    const date = dayKey(row.date);
    goals.set(date, (goals.get(date) ?? 0) + numberOr(row.dailyGoal, 0));
  }
  return Object.fromEntries(dates.map((date) => [date, round2((goals.get(date) ?? 0) / 1.15)]));
}
function numberOr(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function isWorkingStatus(status: string | undefined) { return status === "WORKING" || status === "INVENTORY"; }
function dayKey(date: Date) { return date.toISOString().slice(0, 10); }
function weekDates(start: Date) { return Array.from({ length: 7 }, (_, index) => dayKey(new Date(start.getTime() + index * DAY_MS))); }
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
