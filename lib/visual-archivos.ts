/**
 * El disco del visual: la plantilla, las fotos pendientes y las referencias.
 *
 * Va aparte de la ruta porque lo usan dos: la que arma el reporte --que es
 * quien GUARDA las referencias-- y la que reconoce, que las lee.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import sharp from "sharp";
import { exigirMapaDeBits } from "@/lib/sharp-seguro";
import { plano } from "@/lib/visual-pptx";
import type { Referencia } from "@/lib/visual-reconocer";

export const BASE = process.env.VISUAL_DIR ?? "/home/ubuntu/visual";
export const PLANTILLA = join(BASE, "plantilla.pptx");
export const PENDIENTES = join(BASE, "pendientes");
export const REFERENCIAS = join(BASE, "referencias");
export const PROPUESTA = join(BASE, "propuesta.json");

/**
 * Ancho al que se encogen las fotos ANTES de mandarlas al modelo.
 *
 * ⚠️ No es por dinero, es porque no caben: veintiseis fotos de la tienda pesan
 * unos 18 MB, y en base64 se pasan del limite de la peticion. A 900 px cada una
 * queda en ~100 KB y el reconocimiento no pierde nada — lo que hay que
 * distinguir son letreros y muebles, no una etiqueta de precio.
 *
 * Las ORIGINALES no se tocan: son las que van al PowerPoint.
 */
const ANCHO = 900;

export async function encoger(contenido: Buffer): Promise<Buffer> {
  // ⚠️ Estas fotos llegan por Telegram y nadie las revisa. Se comprueba el
  // formato por los BYTES antes de que `sharp` elija decodificador: ver
  // `lib/sharp-seguro.ts` y el aviso de librsvg que lo motivó.
  exigirMapaDeBits(contenido, "La foto del visual");
  return sharp(contenido).resize({ width: ANCHO, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
}

/**
 * Guarda la foto que se acaba de colocar como referencia de su zona.
 *
 * ⚠️ Esto es lo que hace que el reconocimiento **se siembre solo**: la
 * referencia siempre tiene una semana, nunca una temporada. Es justo lo que
 * importa, porque lo que cambia entre semanas es la mercancia.
 *
 * El nombre del archivo es la clave normalizada, no la etiqueta tal cual: las
 * de la plantilla traen espacios dobles y acentos, y asi el nombre es
 * previsible y no hay dos que choquen.
 */
export async function guardarReferencias(fotos: Array<{ etiqueta: string; contenido: Buffer }>): Promise<number> {
  mkdirSync(REFERENCIAS, { recursive: true });
  let guardadas = 0;
  for (const foto of fotos) {
    const clave = plano(foto.etiqueta);
    if (!clave) continue;
    try {
      writeFileSync(join(REFERENCIAS, `${clave}.jpg`), await encoger(foto.contenido));
      guardadas += 1;
    } catch {
      // Una referencia que no se pudo guardar no puede tumbar la entrega del
      // reporte, que es lo que la tienda espera. La proxima semana se repone.
    }
  }
  return guardadas;
}

/**
 * Las referencias que existen, con el nombre EXACTO que usa la plantilla.
 *
 * Se devuelve la etiqueta de la plantilla y no la del archivo porque es la que
 * el modelo tiene que contestar, y la que luego bautiza la foto.
 */
export function leerReferencias(etiquetas: string[]): Referencia[] {
  if (!existsSync(REFERENCIAS)) return [];
  const enDisco = new Set(readdirSync(REFERENCIAS).filter((f) => f.toLowerCase().endsWith(".jpg")));
  const referencias: Referencia[] = [];
  for (const etiqueta of etiquetas) {
    const archivo = `${plano(etiqueta)}.jpg`;
    if (!enDisco.has(archivo)) continue;
    referencias.push({ etiqueta, contenido: readFileSync(join(REFERENCIAS, archivo)) });
  }
  return referencias;
}

/** Las fotos que hay en pendientes, con su nombre de archivo. */
export function leerPendientes(): string[] {
  if (!existsSync(PENDIENTES)) return [];
  return readdirSync(PENDIENTES).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
}

/** El nombre de archivo sin su extension: es la etiqueta que puso el bot. */
export function etiquetaDe(archivo: string): string {
  return archivo.replace(extname(archivo), "");
}
