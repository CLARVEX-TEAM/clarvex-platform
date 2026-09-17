import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Session } from "@/lib/session";
import {
  NATIVE_CLOCK_SKEW_MS,
  nativeRequestManifest,
  nativeRequestPath,
  sha256Hex,
  verifyNativeSignature
} from "@/lib/native-device-crypto";

const HEADERS = {
  installation: "x-clarvex-device-id",
  challenge: "x-clarvex-device-challenge",
  timestamp: "x-clarvex-device-timestamp",
  signature: "x-clarvex-device-signature"
} as const;

export type AuthorizedNativeDevice = {
  id: string;
  installationId: string;
  userId: string;
  storeId: string;
  profile: string;
  appBuild: number;
  appVersion: string;
};

function denied(message: string, status = 403): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Exige sesión válida y, además, prueba de posesión de la llave privada que vive
 * en Android Keystore. El nonce se consume una sola vez dentro de transacción.
 */
export async function requireNativeDevice(
  request: Request,
  session: Session
): Promise<AuthorizedNativeDevice | NextResponse> {
  const installationId = request.headers.get(HEADERS.installation) ?? "";
  const challengeId = request.headers.get(HEADERS.challenge) ?? "";
  const timestamp = request.headers.get(HEADERS.timestamp) ?? "";
  const signature = request.headers.get(HEADERS.signature) ?? "";
  if (!installationId || !challengeId || !timestamp || !signature) {
    return denied("Esta función requiere un dispositivo registrado.");
  }

  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(Date.now() - timestampMs) > NATIVE_CLOCK_SKEW_MS) {
    return denied("La firma del dispositivo venció.");
  }

  const [device, challenge] = await Promise.all([
    prisma.nativeDevice.findUnique({
      where: { installationId },
      select: {
        id: true,
        installationId: true,
        publicKey: true,
        userId: true,
        storeId: true,
        profile: true,
        appBuild: true,
        appVersion: true,
        status: true
      }
    }),
    prisma.nativeDeviceChallenge.findUnique({ where: { id: challengeId } })
  ]);

  if (
    !device || device.status !== "ACTIVE" || device.userId !== session.userId ||
    device.storeId !== session.storeId
  ) {
    return denied("El dispositivo no está activo para esta sesión.");
  }
  if (
    !challenge || challenge.purpose !== "REQUEST" || challenge.installationId !== installationId ||
    challenge.userId !== session.userId || challenge.storeId !== session.storeId ||
    challenge.usedAt || challenge.expiresAt.getTime() <= Date.now()
  ) {
    return denied("El reto del dispositivo no es válido.");
  }

  const body = new Uint8Array(await request.clone().arrayBuffer());
  const payload = nativeRequestManifest({
    challengeId,
    nonce: challenge.nonce,
    installationId,
    timestamp,
    method: request.method,
    path: nativeRequestPath(request),
    bodySha256: sha256Hex(body)
  });
  if (!verifyNativeSignature(device.publicKey, payload, signature)) {
    return denied("La firma del dispositivo no coincide.");
  }

  const now = new Date();
  const consumed = await prisma.$transaction(async (tx) => {
    const result = await tx.nativeDeviceChallenge.updateMany({
      where: { id: challengeId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now }
    });
    if (result.count !== 1) return false;
    await tx.nativeDevice.update({ where: { id: device.id }, data: { lastSeenAt: now } });
    return true;
  });
  if (!consumed) return denied("El reto del dispositivo ya fue utilizado.", 409);

  return {
    id: device.id,
    installationId: device.installationId,
    userId: device.userId,
    storeId: device.storeId,
    profile: device.profile,
    appBuild: device.appBuild,
    appVersion: device.appVersion
  };
}

export function isNativeDeviceError(value: AuthorizedNativeDevice | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
