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

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Reintenta con timeout: en iOS (PWA) Safari a veces aborta la petición al cambiar
// de pantalla, lo que dejaba la vista pegada en el esqueleto. Aquí se recupera sola.
export async function fetchAppData(): Promise<AppData> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchWithTimeout("/api/app-data", 12000);
      if (!response.ok) throw new Error("No se pudieron cargar los datos del panel.");
      return await response.json() as AppData;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No se pudieron cargar los datos del panel.");
}
