import { prisma } from "@/lib/prisma";
import { matchTeammatesByQuery } from "@/lib/ai/tools/person-query";
import type { Role } from "@/lib/types";

export type TeammateRef = {
  id: string;
  name: string;
  employeeNumber: string;
  role: Role;
};

export type ResolveTeammateResult =
  | { status: "found"; user: TeammateRef }
  | { status: "ambiguous"; candidates: Array<{ name: string; role: Role }> }
  | { status: "not_found"; error: string };

export { matchTeammatesByQuery, normalizePersonQuery } from "@/lib/ai/tools/person-query";

/**
 * Resuelve un colaborador de la tienda por nombre o número de empleado.
 * Nunca exige UUID interno. Si hay varios matches, devuelve candidatos sin IDs.
 */
export async function resolveStoreTeammate(storeId: string, query: string): Promise<ResolveTeammateResult> {
  const trimmed = query.trim();
  if (!trimmed) return { status: "not_found", error: "Indica el nombre o número de empleado del colaborador." };

  const users = await prisma.user.findMany({
    where: { storeId, active: true },
    select: { id: true, name: true, employeeNumber: true, role: true },
    orderBy: { name: "asc" }
  });

  const matches = matchTeammatesByQuery(users, trimmed);
  if (matches.length === 1) {
    return { status: "found", user: matches[0] };
  }
  if (matches.length > 1) {
    return {
      status: "ambiguous",
      candidates: matches.map((user) => ({ name: user.name, role: user.role }))
    };
  }
  return {
    status: "not_found",
    error: `No encontré a nadie llamado «${trimmed}» en tu tienda. Prueba con el nombre completo o el número de empleado.`
  };
}
