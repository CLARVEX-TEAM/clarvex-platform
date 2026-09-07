import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Los orígenes que se aceptan al verificar una huella.
 *
 * ⚠️ **Dentro de la app de Android el origen NO es el dominio.** Con el WebView
 * en modo `WEB_AUTHENTICATION_SUPPORT_FOR_APP`, la petición se enruta por el
 * Credential Manager y la respuesta llega firmada con
 * `android:apk-key-hash:<sha256 del certificado>`. El servidor la rechazaba con
 * «Unexpected authentication response origin», que suena a ataque y era la app
 * legítima.
 *
 * ⚠️ **El origen se DERIVA de `assetlinks.json`, no se escribe a mano.** Ese
 * archivo ya declara qué app --con qué llave-- puede actuar en nombre de este
 * dominio; es la misma decisión, y tenerla escrita dos veces es como acaban
 * diciendo cosas distintas. Al rotar la llave se cambia un solo sitio.
 *
 * ⚠️ **Y no se acepta lo que diga el cliente.** El valor sale de nuestro
 * certificado; el que llega en la respuesta solo se compara. Copiar el origen
 * de un mensaje de error habría dejado entrar a cualquier app que supiera pedirlo.
 */

const ARCHIVO = join(process.cwd(), "public", ".well-known", "assetlinks.json");
const RELACION_CREDENCIALES = "delegate_permission/common.get_login_creds";

type Entrada = {
  relation?: string[];
  target?: { namespace?: string; package_name?: string; sha256_cert_fingerprints?: string[] };
};

/**
 * `AB:CD:…` (SHA-256 en hexadecimal) → el origen que manda Android.
 *
 * ⚠️ **Aquí se CONVIERTE, no se vuelve a resumir.** Las dos formas son el mismo
 * resumen del mismo certificado, escrito distinto:
 *
 * ```
 * assetlinks.json  →  hexadecimal  de sha256(certificado)
 * apk-key-hash     →  base64url    de sha256(certificado)
 * ```
 *
 * Aplicarle otro `sha256` a la huella --que es lo que hacía la primera versión
 * de esta función-- produce un valor que no corresponde a ninguna app, y el
 * síntoma sería el mismo error de origen inesperado que vino a arreglar.
 */
export function huellaAOrigen(huella: string): string | null {
  const limpia = huella.replace(/:/g, "").trim();
  if (!/^[0-9A-Fa-f]{64}$/.test(limpia)) return null;
  return `android:apk-key-hash:${Buffer.from(limpia, "hex").toString("base64url")}`;
}

/** Desde el certificado en DER, que es de donde sale todo lo demás. */
export function certificadoAOrigen(der: Buffer): string {
  return `android:apk-key-hash:${createHash("sha256").update(der).digest("base64url")}`;
}

let cache: string[] | null = null;

/**
 * Lee las huellas declaradas para la relación de CREDENCIALES. Una app declarada
 * solo para `handle_all_urls` --abrir enlaces-- no queda autorizada a
 * autenticar: son permisos distintos y mezclarlos regalaría el segundo.
 */
export function origenesDeAndroid(): string[] {
  if (cache) return cache;
  try {
    const entradas = JSON.parse(readFileSync(ARCHIVO, "utf8")) as Entrada[];
    cache = entradas
      .filter((e) => e.target?.namespace === "android_app" && e.relation?.includes(RELACION_CREDENCIALES))
      .flatMap((e) => e.target?.sha256_cert_fingerprints ?? [])
      // Una sola conversion, la de arriba: dos caminos hacia el mismo valor es
      // como uno de los dos se queda atras sin que nadie lo note.
      .map((h) => huellaAOrigen(h))
      .filter((o): o is string => o !== null);
  } catch (error) {
    // Sin el archivo, la huella sigue funcionando en el navegador y en la PWA.
    // Solo se pierde dentro de la app, y queda dicho.
    console.warn("[webauthn] No se pudo leer assetlinks.json:", (error as Error).message);
    cache = [];
  }
  return cache;
}

/** Para las pruebas: obliga a releer el archivo. */
export function olvidarOrigenes() {
  cache = null;
}

/** El dominio SIEMPRE, más los orígenes de la app declarados en assetlinks. */
export function origenesAceptados(origenWeb: string): string[] {
  return [origenWeb, ...origenesDeAndroid()];
}
