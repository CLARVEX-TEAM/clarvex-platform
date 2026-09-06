import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import type { JWTPayload } from "jose";
import type { Role } from "@/lib/types";

export const SESSION_COOKIE = "clarvex.session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type Session = JWTPayload & {
  userId: string;
  storeId: string;
  role: Role;
  name: string;
  employeeNumber: string;
  platformAdmin: boolean;
  // Usuario "kiosko" de la tienda: solo el checklist. El middleware lo encierra.
  checklistOnly?: boolean;
  // Usuario de demostración: sesión de SOLO LECTURA (el middleware corta no-GET).
  demo?: boolean;
  // Versión de sesión: invalida tokens tras logout / cambio de PIN. Tokens
  // viejos (sin este claim) se tratan como versión 0.
  sessionVersion?: number;
  // Calculado por getServerSession (no viaja en el JWT): tienda sin suscripción vigente.
  storeSuspended?: boolean;
};

let warnedShortSecret = false;
function secret() {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET o NEXTAUTH_SECRET es obligatorio.");
  // Un secreto corto debilita la firma HS256. En producción se rechaza; en
  // desarrollo solo se advierte una vez para no romper entornos locales viejos.
  if (value.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET debe tener al menos 32 caracteres en producción (openssl rand -base64 32).");
    }
    if (!warnedShortSecret) {
      warnedShortSecret = true;
      console.warn("[auth] AUTH_SECRET es corto (<32 caracteres). Usa al menos 32 (openssl rand -base64 32).");
    }
  }
  return new TextEncoder().encode(value);
}

export async function createSessionToken(user: {
  id: string;
  storeId: string;
  role: Role;
  name: string;
  employeeNumber: string;
  platformAdmin?: boolean;
  checklistOnly?: boolean;
  isDemo?: boolean;
  sessionVersion?: number;
}) {
  return new SignJWT({ userId: user.id, storeId: user.storeId, role: user.role, name: user.name, employeeNumber: user.employeeNumber, platformAdmin: user.platformAdmin === true, checklistOnly: user.checklistOnly === true, demo: user.isDemo === true, sessionVersion: user.sessionVersion ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (
      typeof payload.userId !== "string" || typeof payload.storeId !== "string" ||
      typeof payload.role !== "string" || typeof payload.name !== "string" ||
      typeof payload.employeeNumber !== "string"
    ) return null;
    // Tokens emitidos antes de estos campos no los traen: valores seguros.
    if (typeof payload.platformAdmin !== "boolean") payload.platformAdmin = false;
    if (typeof payload.checklistOnly !== "boolean") payload.checklistOnly = false;
    if (typeof payload.demo !== "boolean") payload.demo = false;
    return payload as Session;
  } catch {
    return null;
  }
}

/**
 * El mismo token de sesión, traído en la cabecera en vez de en la cookie.
 *
 * ⚠️ **Existe para la app nativa, que no tiene cookies del navegador.** Es el
 * MISMO JWT firmado, con los mismos claims y la misma revocación por
 * `sessionVersion`: no hay un segundo tipo de sesión que mantener, ni un
 * segundo sitio donde equivocarse.
 *
 * ⚠️ **La cookie manda cuando existe.** Así el comportamiento de la web no
 * cambia ni un ápice: quien tiene cookie sigue exactamente el camino de antes,
 * y la cabecera solo se mira cuando no hay ninguna.
 *
 * ⚠️ No confundir con `Authorization: Bearer` de los cron y de la captura
 * externa. Esas rutas están en la lista pública del middleware y validan su
 * propio secreto dentro del handler: nunca llegan a esta comprobación. Si
 * alguna dejara de ser pública, su secreto NO es un JWT y aquí daría `null`,
 * que es el resultado seguro.
 */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const limpio = header.trim();
  if (!limpio.toLowerCase().startsWith("bearer ")) return null;
  const valor = limpio.slice(7).trim();
  return valor.length > 0 ? valor : null;
}

/**
 * Cabecera con la que un cliente PIDE el token en el cuerpo de la respuesta.
 *
 * ⚠️ **El token no se devuelve nunca sin pedirlo.** La cookie es `httpOnly`
 * justamente para que el JavaScript de la página no pueda leerla; meter el
 * mismo token en el JSON de todas las respuestas de login tiraría esa
 * protección por la ventana en la web. La app lo pide explícitamente porque no
 * tiene otra forma de guardarlo.
 */
export const CLIENT_HEADER = "x-clarvex-cliente";
export const NATIVE_CLIENT = "movil";

/** ¿Este cliente pidió el token en el cuerpo? Solo la app nativa debería. */
export function pideTokenEnCuerpo(cabeceras: Headers): boolean {
  return cabeceras.get(CLIENT_HEADER)?.trim().toLowerCase() === NATIVE_CLIENT;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  // NO subir a "strict": rompe la PWA. Al abrir la app desde el ícono del
  // launcher (arranque en frío), Android trata esa primera navegación como
  // iniciada desde fuera del sitio y NO manda las cookies Strict — el usuario
  // acababa en /login cada vez que cerraba la app desde recientes.
  //
  // "lax" sigue cubriendo el CSRF que importa: no se envía en peticiones
  // cross-site que cambian estado (POST/PUT/DELETE). Strict solo añadía
  // protección en navegaciones GET de nivel superior, que aquí son de lectura.
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS
};

/**
 * Cabecera que BORRA la cookie de sesión.
 *
 * ⚠️ Sin esto, revocar una sesión deja al usuario encerrado.
 *
 * El middleware solo verifica la FIRMA del token; el `sessionVersion` lo
 * comprueban los handlers contra la base. Así que un token revocado —tras subir
 * `sessionVersion` por logout, cambio de PIN o cierre forzado— sigue pareciendo
 * válido en el middleware:
 *
 *   /advisor → /api/auth/session responde 401 → la app va a /login
 *           → el middleware ve el token «válido» y lo devuelve a /advisor → …
 *
 * Un bucle infinito del que no se sale ni cerrando la app, porque la cookie es
 * `httpOnly` y el cliente no puede borrarla. Al expirarla en la propia respuesta
 * 401, la siguiente petición a /login ya llega sin cookie y el login aparece.
 */
export function clearedSessionCookieHeader(): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}
