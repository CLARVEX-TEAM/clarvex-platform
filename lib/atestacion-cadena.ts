import { X509Certificate, createHash } from "node:crypto";
import type { ResultadoCadena } from "@/lib/atestacion";

/**
 * Lo que SÍ se puede verificar hoy de una cadena de atestación.
 *
 * ⚠️ **Esto NO es la verificación completa, y no hay que llamarla así.** Falta
 * lo que de verdad prueba la procedencia: leer la extensión de Google dentro del
 * certificado --una estructura ASN.1-- y comprobar que dice paquete
 * `tech.clarvex.team`, firmado con nuestro certificado, en hardware seguro, y
 * con el reto de ESTA petición dentro.
 *
 * Eso se escribe cuando haya una cadena real de un teléfono de la tienda contra
 * la que probarlo. Escribirlo a ciegas contra la especificación produce código
 * de seguridad que parece funcionar, deja de vigilarse y no protege — que es
 * peor que no tenerlo.
 *
 * Lo que sí hace, y es real: comprobar que los certificados se firman unos a
 * otros hasta la raíz, y anotar la huella de esa raíz. Con esa huella real,
 * comparada después contra la que publica Google, se cierra el círculo.
 */

/** Cuántos certificados admite una cadena. Las de Android traen 3 o 4. */
const MAXIMO = 8;
/** Tope por certificado, en bytes de DER. Lo manda un cliente. */
const TAMANO_MAXIMO = 8 * 1024;

export type CadenaMirada = ResultadoCadena & {
  /** SHA-256 de la clave pública de la raíz, en hexadecimal. */
  huellaRaiz?: string;
  /** Cuántos certificados traía. */
  largo?: number;
};

export function mirarCadena(cadenaBase64: string[]): CadenaMirada {
  if (!Array.isArray(cadenaBase64) || cadenaBase64.length === 0) {
    return { ok: false, motivo: "el teléfono no entregó cadena de atestación" };
  }
  if (cadenaBase64.length > MAXIMO) {
    return { ok: false, motivo: `la cadena trae ${cadenaBase64.length} certificados y el máximo son ${MAXIMO}` };
  }

  const certificados: X509Certificate[] = [];
  for (const [indice, texto] of cadenaBase64.entries()) {
    let bytes: Buffer;
    try {
      bytes = Buffer.from(texto, "base64");
    } catch {
      return { ok: false, motivo: `el certificado ${indice + 1} no es base64` };
    }
    if (bytes.byteLength === 0 || bytes.byteLength > TAMANO_MAXIMO) {
      return { ok: false, motivo: `el certificado ${indice + 1} tiene un tamaño imposible` };
    }
    try {
      certificados.push(new X509Certificate(bytes));
    } catch {
      return { ok: false, motivo: `el certificado ${indice + 1} no se pudo leer` };
    }
  }

  /*
   * ⚠️ Cada certificado tiene que estar firmado por el SIGUIENTE. Sin esta
   * comprobación, cualquiera podría mandar una cadena inventada entera y el
   * servidor solo vería certificados con buena pinta.
   */
  for (let i = 0; i < certificados.length - 1; i++) {
    const hijo = certificados[i]!;
    const padre = certificados[i + 1]!;
    let firmado = false;
    try {
      firmado = hijo.verify(padre.publicKey);
    } catch {
      firmado = false;
    }
    if (!firmado) {
      return { ok: false, motivo: `el certificado ${i + 1} no está firmado por el ${i + 2}` };
    }
  }

  const raiz = certificados[certificados.length - 1]!;
  const huellaRaiz = createHash("sha256").update(raiz.publicKey.export({ type: "spki", format: "der" })).digest("hex");

  /*
   * ⚠️ **La raíz todavía no se compara con la de Google.** Hasta hacerlo, esta
   * cadena demuestra que sus certificados encajan entre sí, NO que vengan del
   * hardware de un teléfono. Se devuelve `nivel: "software"` a propósito para
   * que nada pueda leerse como más de lo que es.
   */
  return { ok: true, nivel: "software", raizConocida: false, huellaRaiz, largo: certificados.length };
}
