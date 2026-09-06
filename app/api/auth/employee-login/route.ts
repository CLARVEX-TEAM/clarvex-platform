import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimitAuth, rateLimitInspect } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { hashPin, publicUser, publicUserPreAuth, verifyPin, canSetupPin } from "@/lib/security";
import { RP_ID } from "@/lib/webauthn";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, getServerSession } from "@/lib/session";
import { pideTokenEnCuerpo } from "@/lib/session-token";
import { hasRealEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("inspect"), employeeNumber: z.string().trim().min(1).max(30) }),
  z.object({ action: z.literal("login"), employeeNumber: z.string().trim().min(1).max(30), pin: z.string().regex(/^\d{4,6}$/, "El PIN debe tener de 4 a 6 digitos.") }),
  z.object({ action: z.literal("setup"), employeeNumber: z.string().trim().min(1).max(30), pin: z.string().regex(/^\d{4,6}$/, "El PIN debe tener de 4 a 6 digitos.") })
]);

// Bloqueo por cuenta: complementa el rate limit por IP (que un atacante puede
// esquivar rotando IPs). Tras 5 PINs errados, la cuenta espera 15 min.
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;
// Backoff exponencial: cada bloqueo consecutivo dura el doble, con tope de 24 h.
const MAX_PIN_LOCK_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const parsed = await parseJson(request, inputSchema);
  if ("response" in parsed) return parsed.response;

  const isInspect = parsed.data.action === "inspect";
  const rateLimit = await (isInspect ? rateLimitInspect(ip) : rateLimitAuth(ip));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Intenta de nuevo en un momento." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const user = await prisma.user.findUnique({ where: { employeeNumber: parsed.data.employeeNumber } });

  if (isInspect) {
    // Los usuarios desactivados se tratan como inexistentes.
    if (!user || !user.active) return NextResponse.json({ error: "Numero de empleado no encontrado." }, { status: 404 });
    /*
     * El botón de huella se ofrece solo si hay credencial PARA ESTE DOMINIO.
     *
     * `biometricEnabled` no alcanza: es un booleano del usuario y no sabe de
     * dominios. Al mudar la app a `team.clarvex.tech`, las credenciales viejas
     * seguían contando y el botón aparecía para fallar con «no hay llaves de
     * acceso» — un error que no le dice nada a quien lo vive.
     */
    const usableCredentials = user.biometricEnabled
      ? await prisma.webAuthnCredential.count({ where: { userId: user.id, rpId: RP_ID } })
      : 0;
    // Sin sesión: solo lo mínimo (ver publicUserPreAuth). Nada de foto, rol,
    // último acceso ni id interno — es cosechable tecleando números de empleado.
    return NextResponse.json({
      user: publicUserPreAuth({ ...user, biometricEnabled: usableCredentials > 0 }),
      requiresPinSetup: !user.pinHash
    });
  }

  // Unified error for "not found", "deactivated" and "wrong PIN" to prevent user enumeration via login
  if (!user || !user.active) {
    return NextResponse.json({ error: "Credenciales invalidas." }, { status: 401 });
  }

  if (parsed.data.action === "setup") {
    if (user.pinHash) return NextResponse.json({ error: "Este usuario ya tiene un PIN configurado." }, { status: 409 });
    
    // El setup de PIN requiere autorización de un gerente/subgerente de la misma tienda (o admin de plataforma)
    const session = await getServerSession();
    if (!canSetupPin(session, user.storeId)) {
      return NextResponse.json({ error: "No autorizado. El setup del PIN requiere autorización de un gerente o subgerente de la tienda." }, { status: 403 });
    }
    
    user.pinHash = await hashPin(parsed.data.pin);
  } else {
    if (!user.pinHash) return NextResponse.json({ error: "Debes crear tu PIN antes de iniciar sesion." }, { status: 409 });
    // Cuenta bloqueada por intentos fallidos: no se procesa el PIN.
    if (user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now()) {
      const retryAfterSeconds = Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 1000);
      return NextResponse.json(
        { error: "Demasiados intentos. Tu cuenta está bloqueada unos minutos por seguridad." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }
    if (!(await verifyPin(parsed.data.pin, user.pinHash))) {
      // PIN incorrecto: cuenta el fallo y bloquea al llegar al máximo, con
      // backoff exponencial según bloqueos consecutivos previos.
      const attempts = user.failedPinAttempts + 1;
      const lock = attempts >= MAX_PIN_ATTEMPTS;
      if (lock) {
        const lockoutCount = user.pinLockoutCount + 1;
        const lockMs = Math.min(PIN_LOCK_MS * 2 ** (lockoutCount - 1), MAX_PIN_LOCK_MS);
        await prisma.user.update({
          where: { id: user.id },
          data: { failedPinAttempts: 0, pinLockedUntil: new Date(Date.now() + lockMs), pinLockoutCount: lockoutCount }
        });
      } else {
        await prisma.user.update({ where: { id: user.id }, data: { failedPinAttempts: attempts } });
      }
      return NextResponse.json({ error: "Credenciales invalidas." }, { status: 401 });
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    // Login/registro exitoso: reinicia el contador y limpia el bloqueo (incl. backoff).
    data: { pinHash: user.pinHash, lastLoginAt: new Date(), failedPinAttempts: 0, pinLockedUntil: null, pinLockoutCount: 0 }
  });
  const token = await createSessionToken(updated);
  // Se pide el correo al ENTRAR, no al recuperar. En la pantalla de recuperación
  // no hay sesión: aceptar ahí el correo que teclee quien sea permitiría que
  // cualquiera con un número de empleado se apoderara de esa cuenta.
  /*
   * ⚠️ **El token solo viaja en el cuerpo si el cliente lo PIDE.**
   *
   * La cookie es `httpOnly` precisamente para que el JavaScript de la página no
   * pueda leerla. Devolver el mismo token en el JSON de todos los logins tiraría
   * esa protección: cualquier script inyectado en la web se lo llevaría. La app
   * nativa lo pide explícitamente porque no tiene cookies del navegador donde
   * guardarlo, y ahí vive en el almacenamiento seguro del sistema.
   *
   * La cookie se manda igual en los dos casos: no cuesta nada y deja abierta la
   * posibilidad de abrir vistas web dentro de la app sin volver a entrar.
   */
  const response = NextResponse.json({
    user: publicUser(updated),
    needsEmail: !hasRealEmail(updated.email),
    ...(pideTokenEnCuerpo(request.headers) ? { token } : {})
  });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
