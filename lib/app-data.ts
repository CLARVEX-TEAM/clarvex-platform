import type { DashboardDailyKpi } from "@/lib/dashboard-kpi";
import type { Announcement, CommissionRule, DayPlan, Evidence, Kpi, LogEntry, Pending, ScheduleShift, User } from "@/lib/types";

export type AppData = {
  users: User[];
  kpis: Kpi[];
  dashboardDaily: DashboardDailyKpi;
  plans: DayPlan[];
  pendings: Pending[];
  logEntries: LogEntry[];
  announcements: Announcement[];
  schedules: ScheduleShift[];
  evidences: Evidence[];
  commissionRules: CommissionRule[];
};

export async function fetchAppData(): Promise<AppData> {
  const response = await fetch("/api/app-data");
  if (!response.ok) throw new Error("No se pudieron cargar los datos del panel.");
  return response.json();
}
