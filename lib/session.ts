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
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { active: true, store: { select: { billingExempt: true, subscriptionPaidUntil: true } } }
  });
  if (!user?.active) return null;
  // Paywall: la tienda sin suscripción vigente queda suspendida (los admins de
  // plataforma nunca se bloquean). requireSession responde 402 con esta marca.
  session.storeSuspended = !user.store.billingExempt
    && (!user.store.subscriptionPaidUntil || user.store.subscriptionPaidUntil.getTime() < Date.now());
  return session;
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
