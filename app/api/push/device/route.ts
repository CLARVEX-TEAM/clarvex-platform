import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { isNativeDeviceError, requireNativeDevice } from "@/lib/native-device-auth";

export const dynamic = "force-dynamic";

/**
 * Registra el aparato Android que corre la app del contenedor, para poder
 * mandarle notificaciones por FCM. El equivalente de `/api/push/subscribe`,
 * que es el de Web Push.
 *
 * ⚠️ **Quien lo llama es la propia web, no la capa nativa.** El contenedor
 * inyecta el puente de Capacitor en `team.clarvex.tech`, así que la página pide
 * el token al plugin y lo registra con SU sesión --la cookie que ya tiene--.
 * Que llamara la capa nativa obligaría a darle credenciales propias a la app,
 * y todo lo que se compila en el paquete lo puede leer quien lo descargue.
 */

const esquema = z.object({
  // Los tokens de FCM rondan los 150-220 caracteres y no tienen formato fijo
  // publicado. Se acota por longitud para no aceptar basura, sin inventar una
  // forma exacta que Google puede cambiar sin avisar.
  token: z.string().min(64).max(4096),
  platform: z.literal("android"),
  /**
   * Que version de la app corre este aparato.
   *
   * ⚠️ **Opcionales, y por eso el registro no se cae sin ellas.** Una version
   * de la app anterior a esto no las manda, y rechazar su registro la dejaria
   * sin notificaciones por un dato que solo sirve para mirar el despliegue:
   * seria cambiar algo que funciona por algo que informa.
   */
  appBuild: z.number().int().positive().max(1_000_000).optional(),
  appVersion: z.string().min(1).max(32).optional(),
  installationId: z.string().uuid().optional()
});

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const signedRequest = request.clone();
  const parsed = await parseJson(request, esquema);
  if ("response" in parsed) return parsed.response;

  const { token, platform, appBuild, appVersion, installationId } = parsed.data;
  let nativeDeviceId: string | undefined;
  if (installationId) {
    const device = await requireNativeDevice(signedRequest, session);
    if (isNativeDeviceError(device)) return device;
    if (device.installationId !== installationId) {
      return NextResponse.json({ error: "La instalación firmada no coincide." }, { status: 403 });
    }
    nativeDeviceId = device.id;
  }

  // ⚠️ Se actualiza POR TOKEN, no por (usuario, token). Google reasigna el
  // token al reinstalar la app o al borrar sus datos, y el teléfono de la
  // tienda lo usan varias personas: sin esto, la anterior seguiría recibiendo
  // en un aparato que ya no es suyo. La última sesión que lo registra manda.
  // ⚠️ Si no vienen, se dejan como estaban en vez de ponerlas a null: una
  // version vieja de la app registrandose no puede borrar lo que ya se sabia
  // de ese aparato.
  const version = {
    ...(appBuild === undefined ? {} : { appBuild }),
    ...(appVersion === undefined ? {} : { appVersion })
  };

  await prisma.deviceToken.upsert({
    where: { token },
    update: { userId: session.userId, platform, nativeDeviceId, ...version },
    create: { userId: session.userId, token, platform, nativeDeviceId, ...version }
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, z.object({ token: z.string().min(1) }));
  if ("response" in parsed) return parsed.response;

  // Solo puede retirar SU registro: el token es de quien lo tiene registrado.
  await prisma.deviceToken.deleteMany({
    where: { token: parsed.data.token, userId: session.userId }
  });

  return NextResponse.json({ ok: true });
}
