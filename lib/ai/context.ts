import type { CopilotContext } from "@/lib/ai/types";
import type { Session } from "@/lib/session-token";

const DEFAULT_TIME_ZONE = "America/Mexico_City";

// Construye el contexto de identidad del Copilot SIEMPRE desde la sesión
// validada (getServerSession relee rol/tienda/estado desde la BD). El cliente y
// el modelo nunca pueden influir en storeId/userId/role.
export function buildCopilotContext(session: Session, now = new Date()): CopilotContext {
  return {
    userId: session.userId,
    storeId: session.storeId,
    role: session.role,
    name: session.name,
    platformAdmin: session.platformAdmin,
    now,
    timeZone: DEFAULT_TIME_ZONE
  };
}
