import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { denyDemo, isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { NATIVE_CHALLENGE_TTL_MS, nativeRegistrationManifest } from "@/lib/native-device-crypto";

export const dynamic = "force-dynamic";

const schema = z.object({
  installationId: z.string().uuid(),
  purpose: z.enum(["REGISTER", "REQUEST"])
});

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const demo = denyDemo(session);
  if (demo) return demo;

  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const { installationId, purpose } = parsed.data;
  const now = new Date();

  if (purpose === "REQUEST") {
    const device = await prisma.nativeDevice.findUnique({
      where: { installationId },
      select: { userId: true, storeId: true, status: true }
    });
    if (
      !device || device.status !== "ACTIVE" || device.userId !== session.userId ||
      device.storeId !== session.storeId
    ) {
      return NextResponse.json({ error: "El dispositivo no está registrado para esta sesión." }, { status: 403 });
    }
  }

  await prisma.nativeDeviceChallenge.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: now } },
        { usedAt: { not: null }, createdAt: { lt: new Date(now.getTime() - NATIVE_CHALLENGE_TTL_MS) } }
      ]
    }
  });
  const outstanding = await prisma.nativeDeviceChallenge.count({
    where: { userId: session.userId, usedAt: null, expiresAt: { gt: now } }
  });
  if (outstanding >= 20) {
    return NextResponse.json({ error: "Hay demasiados retos pendientes. Intenta en un momento." }, { status: 429 });
  }

  const challenge = await prisma.nativeDeviceChallenge.create({
    data: {
      installationId,
      userId: session.userId,
      storeId: session.storeId,
      purpose,
      nonce: randomBytes(32).toString("base64url"),
      expiresAt: new Date(now.getTime() + NATIVE_CHALLENGE_TTL_MS)
    }
  });
  const payload = purpose === "REGISTER"
    ? nativeRegistrationManifest({
        challengeId: challenge.id,
        nonce: challenge.nonce,
        installationId,
        userId: session.userId,
        storeId: session.storeId
      })
    : undefined;

  return NextResponse.json({
    challengeId: challenge.id,
    nonce: challenge.nonce,
    expiresAt: challenge.expiresAt.toISOString(),
    ...(payload ? { payload } : {})
  }, { status: 201 });
}
