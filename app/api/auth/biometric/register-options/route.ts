import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { isoUint8Array } from "@simplewebauthn/server/helpers";
import { denyDemo, isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { RP_ID, RP_NAME } from "@/lib/webauthn";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  // Los usuarios demo son compartidos: registrar una huella ahí se la daría a
  // todos los visitantes. Además este GET escribe (crea el challenge).
  const demo = denyDemo(session);
  if (demo) return demo;

  const existingCredentials = await prisma.webAuthnCredential.findMany({
    where: { userId: session.userId },
    select: { credentialId: true }
  });

  await prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: isoUint8Array.fromUTF8String(session.userId),
    userName: session.employeeNumber,
    userDisplayName: session.name,
    attestationType: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred"
    },
    excludeCredentials: existingCredentials.map((c) => ({ id: c.credentialId })),
    supportedAlgorithmIDs: [-7, -257]
  });

  await prisma.webAuthnChallenge.create({
    data: {
      challenge: options.challenge,
      userId: session.userId,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    }
  });

  return NextResponse.json(options);
}
