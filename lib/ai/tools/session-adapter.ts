import type { CopilotContext } from "@/lib/ai/types";
import type { Session } from "@/lib/session-token";

// Los servicios de datos (getKpiReport, getOpenPendings, ...) reciben `Session`.
// El Copilot solo tiene el `CopilotContext` derivado de la sesión validada.
// Este adaptador reconstruye un Session equivalente para reutilizar esos
// servicios sin duplicar lógica. Solo se usan userId/storeId/role (los servicios
// no leen employeeNumber), pero se completa el shape por seguridad de tipos.
export function toSession(ctx: CopilotContext): Session {
  return {
    userId: ctx.userId,
    storeId: ctx.storeId,
    role: ctx.role,
    name: ctx.name,
    employeeNumber: "",
    platformAdmin: ctx.platformAdmin
  };
}
