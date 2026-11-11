import { createHash, randomInt } from "node:crypto";
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

/**
 * La app «Clarvex» del Pixel Watch: la venta de la tienda en la carátula
 * (complicación) y en un tile.
 *
 * ⚠️ **Se vincula al revés de lo normal, para no teclear en el reloj.** El
 * reloj pide un código corto (`K7M4QX`) y lo enseña en pantalla; la persona se
 * lo manda al bot de WhatsApp («reloj K7M4QX») y el reloj, que está
 * preguntando, recibe su token. El reloj demuestra que es él con un SECRETO
 * que generó y que solo él conoce: el código corto solo sirve para que la
 * persona diga «ese reloj es mío».
 *
 * ⚠️ **El token solo sirve para LEER la venta de hoy de SU tienda.** Se firma
 * con una llave DERIVADA de AUTH_SECRET --no la de la sesión ni la del Forms--
 * así que no se puede usar como sesión ni al revés. Lleva la `sessionVersion`:
 * «cerrar todas las sesiones» lo invalida.
 *
 * ⚠️ **Solo gerencia**: el reloj enseña la venta de toda la tienda.
 */

const PROPOSITO = "reloj";
const DURACION = "365d";
/** Sin 0/O ni 1/I/L: se lee en una pantalla de 45 mm y se escribe en WhatsApp. */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const VIGENCIA_CODIGO_MS = 10 * 60_000;

export function generarCodigo(azar: (max: number) => number = randomInt): string {
  return Array.from({ length: 6 }, () => ALFABETO[azar(ALFABETO.length)]).join("");
}

/** «k7m-4qx», «K7M 4QX» → «K7M4QX». `null` si no tiene forma de código. */
export function normalizarCodigo(texto: string | null | undefined): string | null {
  const limpio = (texto ?? "").toUpperCase().replace(/[\s-]/g, "");
  return limpio.length === 6 && [...limpio].every((c) => ALFABETO.includes(c)) ? limpio : null;
}

/** «reloj K7M4QX», «Reloj k7m-4qx» → «K7M4QX». */
export function pideVincularReloj(texto: string | null | undefined): string | null {
  const m = /^\s*reloj\s+([a-z0-9][a-z0-9\s-]{4,8}[a-z0-9])\s*[.!]*\s*$/i.exec(texto ?? "");
  return m ? normalizarCodigo(m[1]) : null;
}

/** El secreto del reloj no se guarda: solo su huella. */
export const huella = (secreto: string) => createHash("sha256").update(`reloj:${secreto}`).digest("hex");

function llave(): Uint8Array {
  const base = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!base) throw new Error("AUTH_SECRET es obligatorio.");
  return new Uint8Array(createHash("sha256").update(`${base}:${PROPOSITO}`).digest());
}

export async function crearTokenReloj(usuario: { id: string; storeId: string; sessionVersion: number }): Promise<string> {
  return new SignJWT({ storeId: usuario.storeId, sv: usuario.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(usuario.id)
    .setAudience(PROPOSITO)
    .setIssuedAt()
    .setExpirationTime(DURACION)
    .sign(llave());
}

export async function leerTokenReloj(token: string): Promise<{ userId: string; storeId: string; sv: number } | null> {
  try {
    const { payload } = await jwtVerify(token, llave(), { algorithms: ["HS256"], audience: PROPOSITO });
    if (typeof payload.sub !== "string" || typeof payload.storeId !== "string" || typeof payload.sv !== "number") return null;
    return { userId: payload.sub, storeId: payload.storeId, sv: payload.sv };
  } catch {
    return null;
  }
}
