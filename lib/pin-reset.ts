import { prisma } from "@/lib/prisma";
import { hashPin } from "@/lib/security";
import { ACCOUNT_WINDOW_MS, generateToken, hashToken, TOKEN_TTL_MS } from "@/lib/pin-reset-token";

/**
 * Enlaces de un solo uso para restablecer el PIN — la parte que toca la base.
 *
 * Las reglas puras (caducidad, un solo uso, topes) viven en
 * `lib/pin-reset-token.ts`, sin Prisma, para poder probarlas sin base de datos.
 *
 * Decisiones que no son evidentes:
 *
 * 1. EN LA BASE SOLO VIVE EL HASH. El token en claro existe únicamente en el
 *    correo que recibe la persona. Quien lea la tabla (un volcado, un respaldo,
 *    un SELECT de más) no puede fabricar el enlace.
 *
 * 2. GANA EL ÚLTIMO. Pedir un enlace nuevo invalida los anteriores sin usar. Si
 *    alguien pidió tres, solo el último sirve; los otros dos dejan de ser una
 *    llave suelta en una bandeja de entrada.
 *
 * 3. AL CONSUMIRLO SE LIMPIA EL BLOQUEO. Quien llega aquí normalmente llega
 *    porque falló el PIN muchas veces y la cuenta está bloqueada. Restablecer y
 *    dejarla bloqueada sería no resolver nada.
 *
 * 4. SUBE EL sessionVersion. Cambiar la credencial cierra las sesiones abiertas
 *    con la anterior. Es lo mismo que hace `PUT /api/profile` al cambiar el PIN.
 */

export { hashToken, isTokenUsable, TOKEN_TTL_MS, tooManyRecentRequests } from "@/lib/pin-reset-token";

/**
 * Emite un enlace nuevo e invalida los anteriores sin usar (gana el último).
 * Devuelve el token EN CLARO, que solo debe viajar dentro del correo.
 */
export async function issueResetToken(userId: string, requestIp: string | null): Promise<string> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.pinResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() }
    });
    await tx.pinResetToken.create({ data: { tokenHash, userId, expiresAt, requestIp } });
  });

  return token;
}

/** Cuántos enlaces pidió esta cuenta en la ventana reciente. */
export function countRecentRequests(userId: string): Promise<number> {
  return prisma.pinResetToken.count({
    where: { userId, createdAt: { gte: new Date(Date.now() - ACCOUNT_WINDOW_MS) } }
  });
}

/** Marca interna para deshacer la transacción cuando otra petición ganó la carrera. */
class AlreadyUsedError extends Error {
  constructor() {
    super("TOKEN_ALREADY_USED");
    this.name = "AlreadyUsedError";
  }
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Canjea el enlace por un PIN nuevo. Todo en una transacción: o se cambia el
 * PIN y se marca el token, o no pasa nada. Un fallo a la mitad no puede dejar
 * un token consumido sin haber cambiado el PIN (dejaría a la persona fuera y
 * sin enlace).
 */
export async function consumeResetToken(token: string, newPin: string): Promise<ConsumeResult> {
  const tokenHash = hashToken(token);
  const row = await prisma.pinResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true }
  });

  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  const pinHash = await hashPin(newPin);
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      // Marcar primero y con la condición `usedAt: null` en el WHERE: si dos
      // peticiones llegan a la vez con el mismo enlace, solo una actualiza fila.
      const claimed = await tx.pinResetToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now }
      });
      if (claimed.count === 0) throw new AlreadyUsedError();

      await tx.user.update({
        where: { id: row.userId },
        data: {
          pinHash,
          // La persona llega aquí bloqueada casi siempre: hay que abrirle la puerta.
          failedPinAttempts: 0,
          pinLockedUntil: null,
          pinLockoutCount: 0,
          // Credencial nueva: fuera las sesiones abiertas con la anterior.
          sessionVersion: { increment: 1 }
        }
      });
    });
  } catch (error) {
    // Carrera perdida: otra petición consumió el mismo enlace primero.
    if (error instanceof AlreadyUsedError) return { ok: false, reason: "used" };
    throw error;
  }

  return { ok: true, userId: row.userId };
}

/** Borra tokens caducados. Se llama de forma oportunista, sin cron dedicado. */
export function purgeExpiredTokens(): Promise<unknown> {
  return prisma.pinResetToken
    .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
    .catch(() => undefined);
}
