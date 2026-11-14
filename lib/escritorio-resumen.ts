import type { AppData } from "@/lib/app-data";
import { completion } from "@/lib/format";
import { isRealPerson } from "@/lib/store-people";
import { buildDailySeries, buildSalesTrend } from "@/lib/trend";
import { isOpenPending } from "@/lib/types";
import { isRestingToday, restLabel, scheduleStatusByUser } from "@/lib/working-today";

type CaptureRow = { dailySales: number; transactions: number; pieces: number };

// Coincide con el umbral visual del medidor de alcance del escritorio.
export const DESKTOP_FOLLOW_UP_THRESHOLD = 80;

function hasSalesCapture(row: CaptureRow) {
  return row.dailySales !== 0 || row.transactions > 0 || row.pieces > 0;
}

export function buildDesktopSummary(data: AppData) {
  const store = data.dashboardDaily;
  const people = data.users.filter(isRealPerson);
  const advisors = people.filter(person => person.role === "ASESOR");
  const shifts = scheduleStatusByUser(data.schedules, store.date);
  const rowsByUser = new Map<string, typeof data.kpis>();
  const capturedDates = new Set<string>();
  for (const row of data.kpis) {
    if (row.date && (hasSalesCapture(row) || (row.traffic ?? 0) > 0)) capturedDates.add(row.date);
    const rows = rowsByUser.get(row.userId);
    if (rows) rows.push(row);
    else rowsByUser.set(row.userId, [row]);
  }

  const ranking = advisors.map(advisor => {
    const rows = rowsByUser.get(advisor.id) ?? [];
    const kpi = rows.find(row => row.date === store.date);
    const shift = shifts.get(advisor.id);
    const resting = isRestingToday(shift, kpi);
    const sales = kpi && hasSalesCapture(kpi) ? kpi.dailySales : null;
    const goal = kpi?.dailyGoal ?? 0;
    const progress = sales !== null && goal > 0 ? completion(sales, goal) : null;
    return {
      advisor, sales, goal, progress, resting,
      restText: shift ? restLabel(shift) : "Sin turno registrado",
      followUp: !resting && progress !== null && progress < DESKTOP_FOLLOW_UP_THRESHOLD,
      series: buildDailySeries(rows.filter(hasSalesCapture).map(row => ({ date: row.date, value: row.dailySales })), store.date)
    };
  }).sort((a, b) => Number(a.resting) - Number(b.resting) ||
    (b.progress ?? Number.NEGATIVE_INFINITY) - (a.progress ?? Number.NEGATIVE_INFINITY) ||
    (b.sales ?? Number.NEGATIVE_INFINITY) - (a.sales ?? Number.NEGATIVE_INFINITY));

  const priority = data.pendings
    .filter(item => isOpenPending(item) && (item.priority === "critica" || item.priority === "alta"))
    .map(item => ({ ...item, overdue: Boolean(item.dueDate) && item.dueDate < store.date }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) ||
      Number(b.priority === "critica") - Number(a.priority === "critica") ||
      (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));

  const overdueActivities = data.plans
    .filter(plan => plan.published === true && plan.date < store.date)
    .flatMap(plan => plan.activities.filter(activity => !activity.completed)
      .map(activity => ({ ...activity, date: plan.date, userId: plan.userId })))
    .sort((a, b) => a.date.localeCompare(b.date));

  const unconfirmed = data.announcements.flatMap(item => {
    const readBy = new Set(item.readBy);
    const remaining = advisors.filter(advisor => !readBy.has(advisor.id)).length;
    return remaining > 0 ? [{ ...item, remaining }] : [];
  });

  const hasStoreCapture = hasSalesCapture(store) || (store.traffic ?? 0) > 0 || capturedDates.has(store.date);
  return {
    store,
    sales: hasStoreCapture ? store.dailySales : null,
    transactions: hasStoreCapture ? store.transactions : null,
    pieces: hasStoreCapture ? store.pieces : null,
    upt: hasStoreCapture && store.transactions > 0 ? store.pieces / store.transactions : null,
    aur: hasStoreCapture && store.pieces > 0 ? store.dailySales / store.pieces : null,
    avgTicket: hasStoreCapture && store.transactions > 0 ? store.dailySales / store.transactions : null,
    conversion: hasStoreCapture ? store.conversion : null,
    trend: buildSalesTrend(data.kpis.filter(row => row.date && capturedDates.has(row.date)), store.date),
    ranking, priority, overdueActivities, unconfirmed,
    names: new Map(people.map(person => [person.id, person.name]))
  };
}
