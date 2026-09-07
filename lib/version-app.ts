import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * La versión de la app de Android que hay publicada para el equipo.
 *
 * ⚠️ **Vive FUERA del repositorio.** El APK son ~8 MB y cambia con cada versión
 * nativa: en git haría crecer el historial para siempre y cada `git clone`
 * pagaría todas las versiones anteriores. Se deja en `compartido/apk/`, que es
 * el mismo sitio donde ya vive el `.env` y sobrevive a los despliegues.
 *
 * ⚠️ **Si no hay nada ahí, no pasa nada.** La app simplemente no ofrece
 * actualizarse. Es lo correcto: un servidor recién montado no tiene por qué
 * tener un APK, y fallar ahí rompería una pantalla por una función accesoria.
 */

const CARPETA = process.env.CLARVEX_APK_DIR ?? "/home/ubuntu/clarvex/compartido/apk";
const MANIFIESTO = "version.json";

export type VersionApp = {
  /** El entero que compara Android. Es el único orden fiable. */
  versionCode: number;
  /** Lo que se le enseña a la persona: "1.2". */
  versionName: string;
  /** Qué trae, en frases cortas. */
  novedades: string[];
  /** Fecha de publicación, ISO. */
  publicada: string;
  /** Bytes del archivo, para poder decir cuánto va a bajar. */
  bytes: number;
  /** Del propio archivo, no del manifiesto: se recalcula al leerlo. */
  sha256: string;
};

type ManifiestoCrudo = {
  versionCode?: number;
  versionName?: string;
  novedades?: string[];
  publicada?: string;
  archivo?: string;
};

export function rutaDelApk(archivo: string): string {
  // ⚠️ Solo el nombre, nunca una ruta. Un `archivo` con `../` en el manifiesto
  // serviría cualquier fichero del servidor; el manifiesto lo escribimos
  // nosotros, pero un fichero de configuración no es sitio para confiar.
  //
  // Se quitan los separadores Y se rechaza lo que quede en puros puntos: sin lo
  // segundo, "../.." se convierte en "....", que es un nombre raro pero válido,
  // y el error saldría al abrirlo en vez de aquí.
  const limpio = archivo.replace(/[/\\]/g, "");
  if (limpio === "" || /^\.+$/.test(limpio)) {
    throw new Error(`Nombre de archivo inválido en el manifiesto del APK: ${archivo}`);
  }
  return join(CARPETA, limpio);
}

let cache: { version: VersionApp | null; leidoEn: number } | null = null;
const VIDA_CACHE_MS = 60_000;

export function olvidarVersion() {
  cache = null;
}

/**
 * ⚠️ El SHA-256 se calcula del ARCHIVO, no se lee del manifiesto. Es lo que la
 * app compara antes de instalar: si viniera del manifiesto, un manifiesto y un
 * APK que no cuadran darían un hash "correcto" para un binario equivocado, y la
 * comprobación no comprobaría nada.
 */
export function versionPublicada(): VersionApp | null {
  const ahora = Date.now();
  if (cache && ahora - cache.leidoEn < VIDA_CACHE_MS) return cache.version;

  let version: VersionApp | null = null;
  try {
    const crudo = JSON.parse(readFileSync(join(CARPETA, MANIFIESTO), "utf8")) as ManifiestoCrudo;
    if (
      typeof crudo.versionCode === "number" &&
      typeof crudo.versionName === "string" &&
      typeof crudo.archivo === "string"
    ) {
      const ruta = rutaDelApk(crudo.archivo);
      const info = statSync(ruta);
      version = {
        versionCode: crudo.versionCode,
        versionName: crudo.versionName,
        novedades: Array.isArray(crudo.novedades) ? crudo.novedades.filter((n) => typeof n === "string") : [],
        publicada: typeof crudo.publicada === "string" ? crudo.publicada : new Date(info.mtimeMs).toISOString(),
        bytes: info.size,
        sha256: createHash("sha256").update(readFileSync(ruta)).digest("hex")
      };
    }
  } catch {
    // Sin manifiesto o sin archivo: no hay versión publicada. No es un error.
    version = null;
  }

  cache = { version, leidoEn: ahora };
  return version;
}

/** El nombre del archivo tal y como lo declara el manifiesto. */
export function archivoPublicado(): string | null {
  try {
    const crudo = JSON.parse(readFileSync(join(CARPETA, MANIFIESTO), "utf8")) as ManifiestoCrudo;
    return typeof crudo.archivo === "string" ? crudo.archivo : null;
  } catch {
    return null;
  }
}
