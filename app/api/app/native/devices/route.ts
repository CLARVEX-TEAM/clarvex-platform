import { NextResponse } from "next/server";
import { z } from "zod";
import { denyDemo, isApiError, parseJson, requireSession } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { isNativeDeviceError, requireNativeDevice } from "@/lib/native-device-auth";
import { prisma } from "@/lib/prisma";
import { avisosDelEquipo, type SaludCruda } from "@/lib/salud-equipo";
import { comoSeDice, type Procedencia } from "@/lib/atestacion";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  deviceId: z.string().min(8).max(64),
  action: z.enum(["REVOKE", "ACTIVATE"])
});

async function managerRequest(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return { response: session } as const;
  if (session.role !== "GERENTE" && session.role !== "SUBGERENTE" && !session.platformAdmin) {
    return { response: NextResponse.json({ error: "Sin permiso." }, { status: 403 }) } as const;
  }
  const device = await requireNativeDevice(request, session);
  if (isNativeDeviceError(device)) return { response: device } as const;
  return { session, device } as const;
}

export async function GET(request: Request) {
  const auth = await managerRequest(request);
  if ("response" in auth) return auth.response;

  const devices = await prisma.nativeDevice.findMany({
    where: { storeId: auth.session.storeId },
    include: {
      user: { select: { name: true, role: true, active: true } },
      _count: { select: { deviceTokens: true } }
    },
    orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }]
  });

  return NextResponse.json({
    currentDeviceId: auth.device.id,
    devices: devices.map((device) => ({
      id: device.id,
      installationId: device.installationId,
      user: device.user,
      profile: device.profile,
      appBuild: device.appBuild,
      appVersion: device.appVersion,
      status: device.status,
      /*
       * Los avisos se interpretan AQUÍ y no en la pantalla: la regla de cuándo
       * un equipo está mal tiene que ser una sola, y está probada en
       * `lib/salud-equipo`. Se mandan ya masticados, no la salud cruda.
       */
      procedencia: comoSeDice((device.provenance ?? "PENDIENTE") as Procedencia),
      avisos: avisosDelEquipo(
        (device.health ?? null) as SaludCruda | null,
        device.lastSeenAt,
        device.healthAt
      ),
      lastSeenAt: device.lastSeenAt.toISOString(),
      createdAt: device.createdAt.toISOString(),
      revokedAt: device.revokedAt?.toISOString() ?? null,
      notifications: device._count.deviceTokens > 0
    }))
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const auth = await managerRequest(request);
  if ("response" in auth) return auth.response;
  const demo = denyDemo(auth.session);
  if (demo) return demo;
  const parsed = await parseJson(request, updateSchema);
  if ("response" in parsed) return parsed.response;

  const target = await prisma.nativeDevice.findFirst({
    where: { id: parsed.data.deviceId, storeId: auth.session.storeId },
    select: { id: true, installationId: true, userId: true, profile: true, status: true, user: { select: { active: true } } }
  });
  if (!target) return NextResponse.json({ error: "Dispositivo no encontrado." }, { status: 404 });
  if (target.id === auth.device.id && parsed.data.action === "REVOKE") {
    return NextResponse.json({ error: "No puedes revocar el teléfono desde el que estás administrando." }, { status: 409 });
  }
  if (!target.user.active && parsed.data.action === "ACTIVATE") {
    return NextResponse.json({ error: "Activa primero a la persona propietaria del dispositivo." }, { status: 409 });
  }

  const active = parsed.data.action === "ACTIVATE";
  await prisma.$transaction(async (tx) => {
    await tx.nativeDevice.update({
      where: { id: target.id },
      data: { status: active ? "ACTIVE" : "REVOKED", revokedAt: active ? null : new Date() }
    });
    if (!active) {
      await tx.deviceToken.deleteMany({ where: { nativeDeviceId: target.id } });
      await tx.nativeDeviceChallenge.deleteMany({ where: { installationId: target.installationId } });
    }
  });

  await recordAudit({
    session: auth.session,
    action: active ? "native.device.activate" : "native.device.revoke",
    entity: "NativeDevice",
    entityId: target.id,
    storeId: auth.session.storeId,
    detail: JSON.stringify({ installationId: target.installationId, userId: target.userId, profile: target.profile })
  });

  return NextResponse.json({ ok: true, status: active ? "ACTIVE" : "REVOKED" });
}
