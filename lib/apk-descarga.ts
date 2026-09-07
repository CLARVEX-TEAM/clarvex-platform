import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

/**
 * Enlaces firmados y cortos para bajar el APK.
 *
 * ⚠️ **El APK no puede quedar público.** Es el binario de la app de la tienda:
 * publicarlo deja que cualquiera lo descargue, lo inspeccione y lo redistribuya
 * con el nombre de Clarvex. Pero el descargador nativo de Android **no lleva la
 * cookie de sesión** --es una conexión aparte, fuera del WebView-- así que
 * tampoco se puede proteger con la sesión a secas.
 *
 * La solución es un enlace de un solo uso práctico: la web, ya autenticada,
 * pide el enlace; el servidor lo firma con diez minutos de vida; el descargador
 * nativo lo usa y caduca. Sin sesión no hay enlace, y un enlace filtrado sirve
 * diez minutos.
 *
 * ⚠️ Se firma con `AUTH_SECRET`, el mismo de la sesión. No es reutilizar por
 * pereza: es que un secreto más son un sitio más donde rotarlo y un sitio más
 * donde olvidarse. El `aud` distingue este uso de un token de sesión, así que
 * uno no vale como el otro.
 */

const AUDIENCIA = "clarvex:apk";
const VIDA_SEGUNDOS = 600;

function secreto(): Uint8Array {
  const valor = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!valor) throw new Error("AUTH_SECRET es obligatorio para firmar la descarga del APK.");
  return new TextEncoder().encode(valor);
}

export async function firmarDescarga(userId: string, versionCode: number): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  return new SignJWT({ v: versionCode })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(AUDIENCIA)
    .setIssuedAt(ahora)
    .setExpirationTime(ahora + VIDA_SEGUNDOS)
    .sign(secreto());
}

export type DescargaVerificada = { userId: string; versionCode: number };

/**
 * Devuelve quién pidió el enlace, o `null`. Nunca lanza: un token corrupto es
 * una petición inválida, no un error del servidor.
 */
export async function verificarDescarga(token: string): Promise<DescargaVerificada | null> {
  try {
    const { payload } = await jwtVerify(token, secreto(), { audience: AUDIENCIA });
    const versionCode = typeof payload.v === "number" ? payload.v : null;
    if (!payload.sub || versionCode === null) return null;
    return { userId: payload.sub, versionCode };
  } catch {
    return null;
  }
}
