import { NextResponse } from "next/server";
import { clearedSessionCookieHeader, getServerSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { publicUser } from "@/lib/security";
import { hasRealEmail } from "@/lib/email";
import { RP_ID } from "@/lib/webauthn";
import { decidirPinDeGerencia } from "@/lib/pin-gerencia";
import { rateLimitAuth } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  // Se borra la cookie al negar: es la puerta que consulta la app en cada
  // arranque, y sin esto un token revocado deja al usuario rebotando entre
  // /advisor y /login sin llegar nunca al teclado del PIN. Ver
  // `clearedSessionCookieHeader` en lib/session-token.
  if (!session) {
    return NextResponse.json(
      { error: "Sesion requerida." },
      { status: 401, headers: { "Set-Cookie": clearedSessionCookieHeader() } }
    );
  }
  const user = await prisma.user.findFirst({ where: { id: session.userId, storeId: session.storeId }, include: { store: { select: { name: true, kpisEnabled: true } } } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  // `needsEmail`: sin correo real no puede recuperar su PIN solo (la app le puso
  // un relleno al darlo de alta). Lo consume el aviso global EmailBanner.
  /*
   * Biometría USABLE EN ESTE DOMINIO, no el booleano crudo.
   *
   * Tercer sitio con la misma regla, junto a `/api/auth/employee-login` (el
   * botón del login) y `/api/app-data` (la lista de usuarios). Una credencial
   * vale solo donde se registró: con el booleano a secas, el perfil decía
   * «Face ID activo» y no ofrecía registrarla, dejando al usuario sin salida.
   */
  const usableBiometric = user.biometricEnabled
    ? (await prisma.webAuthnCredential.count({ where: { userId: user.id, rpId: RP_ID } })) > 0
    : false;
  return NextResponse.json({ user: { ...publicUser({ ...user, biometricEnabled: usableBiometric }), storeName: user.store.name, kpisEnabled: user.store.kpisEnabled, platformAdmin: user.platformAdmin, checklistOnly: user.checklistOnly, demo: user.isDemo, needsEmail: !hasRealEmail(user.email) } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: Request) {
  // Invalida el token actual (y otras sesiones del usuario) subiendo
  // sessionVersion: un token robado deja de servir tras el logout.
  //
  // EXCEPCIÓN demo: los usuarios del demo público son COMPARTIDOS (DEMO-100 /
  // DEMO-201), así que subir la versión echaría de la app a todos los visitantes
  // conectados en ese momento — cualquiera podría tumbar el demo con solo cerrar
  // sesión. Ahí basta con borrar la cookie: no hay nada que proteger en una
  // sesión de solo lectura sobre datos ficticios.
  const session = await getServerSession();

  /*
   * ⚠️ **El celular KIOSKO no se cierra sin el PIN de gerencia.**
   *
   * Es el aparato compartido de la tienda, y su sesión es la única puerta a
   * Checklist y Conteos. Cerrándola, cualquiera del equipo entraba con SU
   * cuenta personal --que para eso tienen su teléfono-- y el kiosko se quedaba
   * fuera de servicio hasta que alguien de gerencia volviera a abrirlo.
   *
   * ⚠️ **Y la guarda va AQUÍ, no en la pantalla.** Esconder el botón es una
   * decisión de interfaz: la petición se puede repetir a mano. Es la misma
   * regla que este proyecto ya escribió sobre la visibilidad por Capacitor.
   *
   * ⚠️ El kiosko está dado de alta con rol `ASESOR`, así que lo que lo
   * distingue es `checklistOnly`, nunca el rol -- el mismo error que ya se coló
   * en doce consultas.
   */
  /*
   * ⚠️ **Dos salidas sin PIN, y las dos las comprueba el SERVIDOR.**
   *
   * El kiosko no siempre cierra sesión porque alguien lo decida: lo cierra
   * `NativeDeviceRegistration` cuando gerencia revoca el aparato, y la pantalla
   * de tienda suspendida cuando caduca la suscripción. Sin estas dos salidas, mi
   * guarda habría roto la revocación --revocar dejaría el kiosko dentro-- y eso
   * es peor que lo que vengo a arreglar.
   *
   * ⚠️ **No se pregunta al cliente por qué cierra**, que sería decir «pásame la
   * excusa y te dejo». Se mira el estado:
   *
   *   - la tienda está suspendida, así que la app no sirve igualmente;
   *   - el aparato TUVO dispositivos registrados y ninguno sigue activo, o sea
   *     que lo revocaron. Haber tenido alguno importa: sin esa condición, un
   *     kiosko que nunca registró --APK vieja, PWA-- se saltaría la guarda
   *     siempre.
   */
  const revocado = session?.checklistOnly
    ? await (async () => {
        const [total, activos] = await Promise.all([
          prisma.nativeDevice.count({ where: { userId: session.userId } }),
          prisma.nativeDevice.count({ where: { userId: session.userId, status: "ACTIVE" } })
        ]);
        return total > 0 && activos === 0;
      })()
    : false;

  if (session?.checklistOnly && !session.storeSuspended && !revocado) {
    const cuerpo = await request.json().catch(() => ({})) as { employeeNumber?: unknown; pin?: unknown };
    const employeeNumber = typeof cuerpo.employeeNumber === "string" ? cuerpo.employeeNumber.trim() : "";
    const pin = typeof cuerpo.pin === "string" ? cuerpo.pin : "";
    if (!employeeNumber || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ error: "Este equipo lo cierra gerencia con su PIN.", requierePin: true }, { status: 401 });
    }

    // El freno por IP es el mismo del login: sin él, esto sería una puerta de
    // diez mil llaves que se puede probar entera desde la propia pantalla.
    const limite = await rateLimitAuth(clientIp(request.headers));
    if (!limite.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Intenta de nuevo en un momento.", requierePin: true },
        { status: 429, headers: { "Retry-After": String(limite.retryAfterSeconds) } }
      );
    }

    /* La fila se lee aquí y la escritura se aplica aquí: `lib/pin-gerencia`
       decide sin tocar Prisma, que es lo que lo hace comprobable. */
    const candidato = await prisma.user.findUnique({ where: { employeeNumber } });
    const resultado = await decidirPinDeGerencia(candidato, pin, session.storeId);
    if (resultado.escribir && candidato) {
      await prisma.user.update({ where: { id: candidato.id }, data: resultado.escribir }).catch(() => undefined);
    }
    if (!resultado.ok) {
      const error = resultado.motivo === "bloqueada"
        ? "Demasiados intentos. Esa cuenta está bloqueada unos minutos por seguridad."
        : "Número de empleado o PIN incorrectos.";
      return NextResponse.json({ error, requierePin: true }, { status: resultado.motivo === "bloqueada" ? 429 : 401 });
    }

    /*
     * Queda auditado: un kiosko cerrado a media jornada deja la tienda sin
     * capturar, y sin esta línea no habría forma de saber quién lo hizo.
     */
    await prisma.auditLog.create({
      data: {
        storeId: session.storeId,
        actorId: session.userId,
        actorName: resultado.nombre,
        action: "kiosko.cerrar-sesion",
        entity: "session",
        entityId: session.userId,
        detail: `Cierre del kiosko autorizado con el PIN de ${employeeNumber}`
      }
    }).catch(() => undefined);
  }

  if (session && !session.demo) {
    await prisma.user.update({ where: { id: session.userId }, data: { sessionVersion: { increment: 1 } } }).catch(() => undefined);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
