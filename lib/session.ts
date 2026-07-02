import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/types";
import { SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/session-token";

export { createSessionToken, SESSION_COOKIE, sessionCookieOptions, verifySessionToken } from "@/lib/session-token";
export type { Session } from "@/lib/session-token";

export async function getServerSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) return null;
  // Revocación: si el usuario fue desactivado (o eliminado), su JWT deja de
  // valer de inmediato aunque no haya expirado.
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { active: true } });
  return user?.active ? session : null;
}

export function sessionUser(session: Session): User {
  return {
    id: session.userId,
    name: session.name,
    employeeNumber: session.employeeNumber,
    role: session.role,
    avatar: session.name.slice(0, 2).toUpperCase()
  };
}
