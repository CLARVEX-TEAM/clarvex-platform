import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import type { JWTPayload } from "jose";
import type { Role } from "@/lib/types";

export const SESSION_COOKIE = "clarvex.session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type Session = JWTPayload & {
  userId: string;
  storeId: string;
  role: Role;
  name: string;
  employeeNumber: string;
  platformAdmin: boolean;
  // Versión de sesión: invalida tokens tras logout / cambio de PIN. Tokens
  // viejos (sin este claim) se tratan como versión 0.
  sessionVersion?: number;
  // Calculado por getServerSession (no viaja en el JWT): tienda sin suscripción vigente.
  storeSuspended?: boolean;
};

let warnedShortSecret = false;
function secret() {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET o NEXTAUTH_SECRET es obligatorio.");
  // Un secreto corto debilita la firma HS256. En producción se rechaza; en
  // desarrollo solo se advierte una vez para no romper entornos locales viejos.
  if (value.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET debe tener al menos 32 caracteres en producción (openssl rand -base64 32).");
    }
    if (!warnedShortSecret) {
      warnedShortSecret = true;
      console.warn("[auth] AUTH_SECRET es corto (<32 caracteres). Usa al menos 32 (openssl rand -base64 32).");
    }
  }
  return new TextEncoder().encode(value);
}

export async function createSessionToken(user: {
  id: string;
  storeId: string;
  role: Role;
  name: string;
  employeeNumber: string;
  platformAdmin?: boolean;
  sessionVersion?: number;
}) {
  return new SignJWT({ userId: user.id, storeId: user.storeId, role: user.role, name: user.name, employeeNumber: user.employeeNumber, platformAdmin: user.platformAdmin === true, sessionVersion: user.sessionVersion ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (
      typeof payload.userId !== "string" || typeof payload.storeId !== "string" ||
      typeof payload.role !== "string" || typeof payload.name !== "string" ||
      typeof payload.employeeNumber !== "string"
    ) return null;
    // Tokens emitidos antes de este campo no lo traen: tratarlos como no-admin.
    if (typeof payload.platformAdmin !== "boolean") payload.platformAdmin = false;
    return payload as Session;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS
};
