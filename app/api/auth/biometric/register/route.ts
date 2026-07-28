import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { denyDemo, isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ORIGIN, RP_ID } from "@/lib/webauthn";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  // El middleware exceptúa /api/auth/* del candado demo para permitir el logout,
  // así que este POST hay que cerrarlo aquí.
  const demo = denyDemo(session);
  if (demo) return demo;

  let body: RegistrationResponseJSON;
  try {
    body = (await request.json()) as RegistrationResponseJSON;
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  const challenge = await prisma.webAuthnChallenge.findFirst({
    where: { userId: session.userId, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: "desc" }
  });
  if (!challenge) return NextResponse.json({ error: "Desafio expirado o no encontrado." }, { status: 400 });

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challenge.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true
    });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Verificacion fallida." }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Verificacion de biometria fallida." }, { status: 400 });
  }

  await prisma.webAuthnChallenge.delete({ where: { id: challenge.id } });

  const { credential } = verification.registrationInfo;
  await prisma.webAuthnCredential.upsert({
    where: { credentialId: credential.id },
    create: {
      userId: session.userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: body.response.transports ? JSON.stringify(body.response.transports) : null
    },
    update: {
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter
    }
  });

  await prisma.user.update({ where: { id: session.userId }, data: { biometricEnabled: true } });

  return NextResponse.json({ verified: true });
}
