import type { Role } from "@/lib/types";

export function isStoreManager(role: Role): boolean {
  return role === "GERENTE" || role === "SUBGERENTE";
}

/** La búsqueda de otros colaboradores por nombre/ID es solo gerencia. */
export function managerOnlyAdvisorQueryError(): string {
  return "Por seguridad solo gerencia puede consultar datos de otros colaboradores. Tú solo puedes ver tu información.";
}
