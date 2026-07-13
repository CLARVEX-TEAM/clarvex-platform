import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { parseJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimitAuth } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { RP_ID } from "@/lib/webauthn";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const inputSchema = z.object({ employeeNumber: z.string().trim().min(1).max(30) });

export async function POST(request: Request) {
  const rateLimit = await rateLimitAuth(clientIp(request.headers));
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Demasiados intentos. Intenta de nuevo en un momento." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  const parsed = await parseJson(request, inputSchema);
  if ("response" in parsed) return parsed.response;

  const user = await prisma.user.findUnique({
    where: { employeeNumber: parsed.data.employeeNumber },
    include: { webAuthnCredentials: { select: { credentialId: true, transports: true } } }
  });
  // Misma respuesta para inexistente / inactivo / sin biometría: evita enumerar
  // qué empleados tienen Face ID / huella registrada.
  if (!user || !user.active || !user.biometricEnabled || user.webAuthnCredentials.length === 0) {
    return NextResponse.json({ error: "No se pudo iniciar la autenticación biométrica." }, { status: 400 });
  }

  // Un solo desafío activo por usuario: limpia expirados y los previos de este
  // usuario antes de emitir uno nuevo (reduce la ventana de replay).
  await prisma.webAuthnChallenge.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { userId: user.id }] } });

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: user.webAuthnCredentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[]) : undefined
    })),
    userVerification: "required"
  });

  await prisma.webAuthnChallenge.create({
    data: {
      challenge: options.challenge,
      userId: user.id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    }
  });

  return NextResponse.json(options);
}
