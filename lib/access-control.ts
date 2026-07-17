import type { Role } from "@/lib/types";

export const DATA_SOURCE_ROLES: Role[] = ["GERENTE", "SUBGERENTE"];

export function canManageDataSources(role: Role) {
  return DATA_SOURCE_ROLES.includes(role);
}

/**
 * Quién puede usar el checklist de tienda: gerencia, y también el usuario "kiosko"
 * (el celular de la tienda que SOLO escanea el cierre), aunque su rol sea ASESOR.
 */
export function canUseChecklist(session: { role: Role; checklistOnly?: boolean; platformAdmin?: boolean }): boolean {
  return session.checklistOnly === true || session.platformAdmin === true || DATA_SOURCE_ROLES.includes(session.role);
}
