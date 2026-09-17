import { NextResponse } from "next/server";
import { z } from "zod";
import { denyDemo, isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { nativeRegistrationManifest, verifyNativeSignature } from "@/lib/native-device-crypto";

export const dynamic = "force-dynamic";

const schema = z.object({
  challengeId: z.string().min(8).max(64),
  installationId: z.string().uuid(),
  publicKey: z.string().min(64).max(2048),
  signature: z.string().min(64).max(1024),
  profile: z.enum(["PERSONAL", "KIOSK"]).optional(),
  appBuild: z.number().int().positive().max(1_000_000),
  appVersion: z.string().min(1).max(32),
  capabilities: z.array(z.string().regex(/^[a-z][a-zA-Z0-9]{1,47}$/)).max(32)
});

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const demo = denyDemo(session);
  if (demo) return demo;

  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const input = parsed.data;
  const requestedProfile = input.profile ?? (session.checklistOnly ? "KIOSK" : "PERSONAL");
  if (
    requestedProfile === "KIOSK" && !session.platformAdmin &&
    session.role !== "GERENTE" && session.role !== "SUBGERENTE" && session.checklistOnly !== true
  ) {
    return NextResponse.json({ error: "Solo gerencia puede registrar un kiosco." }, { status: 403 });
  }

  const [challenge, current] = await Promise.all([
    prisma.nativeDeviceChallenge.findUnique({ where: { id: input.challengeId } }),
    prisma.nativeDevice.findUnique({ where: { installationId: input.installationId } })
  ]);
  if (
    !challenge || challenge.purpose !== "REGISTER" ||
    challenge.installationId !== input.installationId ||
    challenge.userId !== session.userId || challenge.storeId !== session.storeId ||
    challenge.usedAt || challenge.expiresAt.getTime() <= Date.now()
  ) {
    return NextResponse.json({ error: "El reto de registro no es válido." }, { status: 403 });
  }
  if (current?.status === "REVOKED") {
    return NextResponse.json({ error: "Este dispositivo fue revocado." }, { status: 403 });
  }
  if (current && current.publicKey !== input.publicKey) {
    return NextResponse.json({ error: "La identidad de esta instalación cambió." }, { status: 409 });
  }

  const payload = nativeRegistrationManifest({
    challengeId: challenge.id,
    nonce: challenge.nonce,
    installationId: input.installationId,
    userId: session.userId,
    storeId: session.storeId
  });
  if (!verifyNativeSignature(input.publicKey, payload, input.signature)) {
    return NextResponse.json({ error: "La firma del dispositivo no coincide." }, { status: 403 });
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const consumed = await tx.nativeDeviceChallenge.updateMany({
      where: { id: challenge.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now }
    });
    if (consumed.count !== 1) return null;

    const device = await tx.nativeDevice.upsert({
      where: { installationId: input.installationId },
      update: {
        userId: session.userId,
        storeId: session.storeId,
        ...(input.profile ? { profile: input.profile } : {}),
        appBuild: input.appBuild,
        appVersion: input.appVersion,
        capabilities: input.capabilities,
        lastSeenAt: now
      },
      create: {
        installationId: input.installationId,
        publicKey: input.publicKey,
        userId: session.userId,
        storeId: session.storeId,
        profile: requestedProfile,
        appBuild: input.appBuild,
        appVersion: input.appVersion,
        capabilities: input.capabilities,
        lastSeenAt: now
      }
    });
    await tx.auditLog.create({
      data: {
        storeId: session.storeId,
        actorId: session.userId,
        actorName: session.name,
        action: current ? "native.device.refresh" : "native.device.register",
        entity: "NativeDevice",
        entityId: device.id,
        detail: JSON.stringify({
          installationId: input.installationId,
          profile: input.profile ?? current?.profile ?? requestedProfile,
          appBuild: input.appBuild,
          appVersion: input.appVersion
        })
      }
    });
    return device;
  });
  if (!result) {
    return NextResponse.json({ error: "El reto de registro ya fue utilizado." }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    device: {
      id: result.id,
      installationId: result.installationId,
      profile: result.profile,
      status: result.status,
      appBuild: result.appBuild,
      appVersion: result.appVersion
    }
  }, { status: current ? 200 : 201 });
}
