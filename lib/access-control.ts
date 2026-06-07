import type { Role } from "@/lib/types";

export const DATA_SOURCE_ROLES: Role[] = ["GERENTE", "SUBGERENTE"];

export function canManageDataSources(role: Role) {
  return DATA_SOURCE_ROLES.includes(role);
}
