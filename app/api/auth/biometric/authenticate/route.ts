import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { parseJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimitAuth } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { publicUser } from "@/lib/security";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { ORIGIN, RP_ID } from "@/lib/webauthn";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const inputSchema = z.object({
  employeeNumber: z.string().trim().min(1).max(30),
  response: z.unknown()
});

export async function POST(request: Request) {
  const rateLimit = await rateLimitAuth(clientIp(request.headers));
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Demasiados intentos. Intenta de nuevo en un momento." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  const parsed = await parseJson(request, inputSchema);
  if ("response" in parsed) return parsed.response;

  const authResponse = parsed.data.response as AuthenticationResponseJSON;

  const user = await prisma.user.findUnique({
    where: { employeeNumber: parsed.data.employeeNumber },
    include: { webAuthnCredentials: true }
  });
  if (!user || !user.active) return NextResponse.json({ error: "Credenciales invalidas." }, { status: 401 });

  const credential = user.webAuthnCredentials.find((c) => c.credentialId === authResponse.id);
  if (!credential) return NextResponse.json({ error: "Credencial no reconocida." }, { status: 401 });

  const challenge = await prisma.webAuthnChallenge.findFirst({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: "desc" }
  });
  if (!challenge) return NextResponse.json({ error: "Desafio expirado." }, { status: 400 });

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: authResponse,
      expectedChallenge: challenge.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credential.credentialId,
        publicKey: Buffer.from(credential.publicKey, "base64url"),
        counter: Number(credential.counter),
        transports: credential.transports ? (JSON.parse(credential.transports) as AuthenticatorTransportFuture[]) : undefined
      },
      requireUserVerification: true
    });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Autenticacion fallida." }, { status: 401 });
  }

  if (!verification.verified) return NextResponse.json({ error: "Biometria no verificada." }, { status: 401 });

  await prisma.webAuthnChallenge.delete({ where: { id: challenge.id } });
  await prisma.webAuthnCredential.update({
    where: { id: credential.id },
    data: { counter: verification.authenticationInfo.newCounter }
  });

  // La biometría es prueba fuerte de identidad (no forzable por fuerza bruta):
  // un login exitoso reinicia el contador y limpia el bloqueo de PIN del dueño.
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedPinAttempts: 0, pinLockedUntil: null, pinLockoutCount: 0 } });
  const token = await createSessionToken(updated);
  const res = NextResponse.json({ user: publicUser(updated) });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
