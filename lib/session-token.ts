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
};

function secret() {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET o NEXTAUTH_SECRET es obligatorio.");
  return new TextEncoder().encode(value);
}

export async function createSessionToken(user: {
  id: string;
  storeId: string;
  role: Role;
  name: string;
  employeeNumber: string;
}) {
  return new SignJWT({ userId: user.id, storeId: user.storeId, role: user.role, name: user.name, employeeNumber: user.employeeNumber })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (
      typeof payload.userId !== "string" || typeof payload.storeId !== "string" ||
      typeof payload.role !== "string" || typeof payload.name !== "string" ||
      typeof payload.employeeNumber !== "string"
    ) return null;
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
