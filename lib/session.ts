import { cookies } from "next/headers";
import type { User } from "@/lib/types";
import { SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/session-token";

export { createSessionToken, SESSION_COOKIE, sessionCookieOptions, verifySessionToken } from "@/lib/session-token";
export type { Session } from "@/lib/session-token";

export async function getServerSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
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
