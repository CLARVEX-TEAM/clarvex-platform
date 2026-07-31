import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * La parte PURA de los enlaces de restablecimiento: generar, hashear y decidir
 * si un token sigue sirviendo.
 *
 * Vive separado de `lib/pin-reset.ts` a propósito: ese módulo importa Prisma, y
 * eso obliga a levantar la base de datos para probar una función que solo hace
 * cuentas con fechas. Aquí no se importa nada más que `node:crypto`, así que
 * las reglas de caducidad y de un solo uso se prueban sin infraestructura.
 */

/** Media hora: de sobra para abrir el correo, corto para una llave suelta. */
export const TOKEN_TTL_MS = 30 * 60 * 1000;

/** Máximo de enlaces por cuenta en la ventana, para que nadie use esto de ariete. */
export const MAX_REQUESTS_PER_ACCOUNT = 3;
export const ACCOUNT_WINDOW_MS = 15 * 60 * 1000;

/**
 * 32 bytes de aleatoriedad criptográfica en base64url. No lleva ningún dato del
 * usuario dentro: no se puede adivinar a quién pertenece mirándolo.
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Compara dos hashes en tiempo constante.
 *
 * La búsqueda en la base ya va por índice único sobre el hash, así que esto es
 * un cinturón adicional para el camino en el que sí comparamos en memoria.
 */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    // Buffer.from ignora lo que no sea hex: si el resultado no mide lo que
    // debería, la entrada no era un hash y no hay nada que comparar.
    if (left.length !== right.length || left.length * 2 !== a.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export type TokenRow = { expiresAt: Date; usedAt: Date | null };

/** ¿Sirve todavía este token? Pura, para poder probarla sin base de datos. */
export function isTokenUsable(row: TokenRow | null, now: Date = new Date()): boolean {
  if (!row) return false;
  if (row.usedAt) return false;
  return row.expiresAt.getTime() > now.getTime();
}

/** ¿Se pasó del tope de solicitudes recientes esta cuenta? */
export function tooManyRecentRequests(count: number): boolean {
  return count >= MAX_REQUESTS_PER_ACCOUNT;
}
