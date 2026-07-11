import type { Role } from "@/lib/types";
import type { Session } from "@/lib/session-token";

/** Sesión mínima de gerencia para crons que reutilizan getKpiReport. */
export function cronManagerSession(input: {
  userId: string;
  storeId: string;
  role: Role;
  name: string;
  employeeNumber?: string;
}): Session {
  return {
    userId: input.userId,
    storeId: input.storeId,
    role: input.role,
    name: input.name,
    employeeNumber: input.employeeNumber ?? "",
    platformAdmin: false
  };
}
