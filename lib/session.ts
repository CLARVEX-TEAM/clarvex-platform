import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/types";
import { bearerToken, SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/session-token";

export { clearedSessionCookieHeader, createSessionToken, SESSION_COOKIE, sessionCookieOptions, verifySessionToken } from "@/lib/session-token";
export type { Session } from "@/lib/session-token";

export async function getServerSession() {
  // Cookie primero, cabecera después: la web no cambia de camino. Mismo JWT,
  // misma revocación por `sessionVersion` — ver `bearerToken`.
  const token = (await cookies()).get(SESSION_COOKIE)?.value
    ?? bearerToken((await headers()).get("authorization"));
  const session = token ? await verifySessionToken(token) : null;
  if (!session) return null;
  // Revocación: si el usuario fue desactivado (o eliminado), su JWT deja de
  // valer de inmediato aunque no haya expirado.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      active: true,
      role: true,
      name: true,
      storeId: true,
      platformAdmin: true,
      isDemo: true,
      sessionVersion: true,
      store: { select: { billingExempt: true, subscriptionPaidUntil: true } }
    }
  });
  if (!user?.active) return null;
  // Revocación por versión: tras logout o cambio de PIN se incrementa
  // sessionVersion, invalidando de inmediato los tokens emitidos antes (aunque
  // no hayan expirado). Tokens viejos sin el claim se tratan como versión 0.
  if ((session.sessionVersion ?? 0) !== user.sessionVersion) return null;
  // El rol, el nombre, la tienda y el permiso de administrador se re-leen de la BD:
  // de esta forma aplican de inmediato sin obligar a re-login (el JWT podría estar viejo).
  session.role = user.role;
  session.name = user.name;
  session.storeId = user.storeId;
  session.platformAdmin = user.platformAdmin;
  session.demo = user.isDemo === true;
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
