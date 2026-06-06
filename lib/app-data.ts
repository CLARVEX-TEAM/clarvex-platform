import type { Announcement, DayPlan, Kpi, LogEntry, Pending, ScheduleShift, User } from "@/lib/types";

export type AppData = {
  users: User[];
  kpis: Kpi[];
  plans: DayPlan[];
  pendings: Pending[];
  logEntries: LogEntry[];
  announcements: Announcement[];
  schedules: ScheduleShift[];
};

export async function fetchAppData(): Promise<AppData> {
  const response = await fetch("/api/app-data");
  if (!response.ok) throw new Error("No se pudieron cargar los datos del panel.");
  return response.json();
}
