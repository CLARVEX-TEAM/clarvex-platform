import type { CopilotContext } from "@/lib/ai/types";
import { dashboardDateKey } from "@/lib/dashboard-kpi";
import type { Session } from "@/lib/session-token";

// Misma zona que crons y operación en tienda (Monterrey). Evita que "hoy" sea
// el día UTC del VPS cuando en México aún es el día anterior.
const DEFAULT_TIME_ZONE = "America/Monterrey";

/** Medianoche UTC del día retail en la zona de la tienda. */
export function retailTodayUtc(now: Date, timeZone = DEFAULT_TIME_ZONE): Date {
  return new Date(`${dashboardDateKey(now, timeZone)}T00:00:00.000Z`);
}

// Construye el contexto de identidad del Copilot SIEMPRE desde la sesión
// validada (getServerSession relee rol/tienda/estado desde la BD). El cliente y
// el modelo nunca pueden influir en storeId/userId/role.
export function buildCopilotContext(session: Session, now = new Date()): CopilotContext {
  const timeZone = DEFAULT_TIME_ZONE;
  const todayKey = dashboardDateKey(now, timeZone);
  return {
    userId: session.userId,
    storeId: session.storeId,
    role: session.role,
    name: session.name,
    platformAdmin: session.platformAdmin,
    todayKey,
    now: retailTodayUtc(now, timeZone),
    timeZone
  };
}
