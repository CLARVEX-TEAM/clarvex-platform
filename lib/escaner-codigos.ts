import { parseTagQr } from "@/lib/cycle-count";
import type { LecturaDeCodigo } from "@/lib/puente-nativo";

/**
 * Qué hacer con lo que devuelve el lector nativo de códigos.
 *
 * Está aparte del componente porque es lo único que se puede probar: la cámara,
 * el permiso y la interfaz del escáner los pone Android.
 *
 * ⚠️ **Los cuatro finales son distintos y confundir dos cuesta.** «No hay lector
 * nativo» tiene que caer al escáner web --si no, un teléfono sin servicios de
 * Google se queda sin poder contar--; «la persona cerró» no es un fallo; y un
 * código que no es de un marbete tiene que DECIRSE, porque leerlo y no hacer
 * nada se lee exactamente igual que un escáner roto.
 */
export type QueHacer =
  /** Se leyó un marbete de esta tienda. */
  | { accion: "marbete"; numero: number }
  /** Aquí no hay lector nativo: abrir el escáner web de siempre. */
  | { accion: "web" }
  /** La persona cerró el escáner. */
  | { accion: "cerrar" }
  /** Se leyó algo que no es un marbete. */
  | { accion: "ajeno" };

export function decidirLectura(lectura: LecturaDeCodigo): QueHacer {
  if (!lectura.disponible) return { accion: "web" };
  if (lectura.cancelado || !lectura.valor) return { accion: "cerrar" };

  /*
   * ⚠️ Quién es cada marbete lo decide `parseTagQr`, no el plugin. El nativo
   * devuelve el texto crudo a propósito: la regla de negocio vive en la web,
   * donde están sus pruebas, y no repartida entre dos repositorios.
   */
  const numero = parseTagQr(lectura.valor);
  return numero === null ? { accion: "ajeno" } : { accion: "marbete", numero };
}
