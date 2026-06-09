import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { parseJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { RP_ID } from "@/lib/webauthn";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const inputSchema = z.object({ employeeNumber: z.string().trim().min(1).max(30) });

export async function POST(request: Request) {
  const parsed = await parseJson(request, inputSchema);
  if ("response" in parsed) return parsed.response;

  const user = await prisma.user.findUnique({
    where: { employeeNumber: parsed.data.employeeNumber },
    include: { webAuthnCredentials: { select: { credentialId: true, transports: true } } }
  });
  if (!user || !user.biometricEnabled || user.webAuthnCredentials.length === 0) {
    return NextResponse.json({ error: "Biometria no disponible para este usuario." }, { status: 404 });
  }

  await prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: user.webAuthnCredentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[]) : undefined
    })),
    userVerification: "preferred"
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
