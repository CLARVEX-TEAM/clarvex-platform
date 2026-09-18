import { createHash } from "node:crypto";

/**
 * Que un reintento no vuelva a escribir.
 *
 * ⚠️ **Es el cimiento de la captura sin conexión**, y va ANTES que la cola a
 * propósito. Una cola que reintenta sobre endpoints que no son idempotentes
 * duplica a escala lo que ya pasó a mano: el 14 de septiembre de 2026 el folio
 * 1766932 se capturó dos veces y sus doce piezas se contaron doble en el
 * teórico, sin nada que lo delatara hasta el conteo físico.
 *
 * ⚠️ **No todas las escrituras lo necesitan.** Marcar una tarea del checklist
 * vuelve a escribir lo mismo: repetirla es inofensiva. Subir una evidencia crea
 * un objeto nuevo en R2 y una fila más en cada intento. La regla es simple: lo
 * que CREA filas necesita clave; lo que sobrescribe un valor, no.
 */

/** Cuánto vale una clave antes de poder olvidarla. */
export const VIGENCIA_HORAS = 72;

/**
 * ⚠️ La clave la elige el CLIENTE, así que se valida antes de usarla como
 * índice. Sin un mínimo, una clave vacía o de un carácter colisionaría entre
 * operaciones distintas de la misma tienda y una se tragaría a la otra.
 */
export function claveValida(clave: unknown): clave is string {
  return typeof clave === "string" && /^[A-Za-z0-9_:.-]{16,128}$/.test(clave);
}

/**
 * Huella del cuerpo de la petición.
 *
 * ⚠️ Sirve para distinguir «el mismo intento otra vez» de «otra operación con
 * la clave repetida». Lo segundo es un fallo del cliente y hay que gritarlo:
 * devolverle la respuesta vieja haría desaparecer una escritura real en
 * silencio, que es peor que un error.
 */
export function huellaDelCuerpo(partes: unknown): string {
  return createHash("sha256").update(JSON.stringify(partes ?? null)).digest("hex");
}

export type EstadoClave =
  | { decision: "escribir" }
  | { decision: "repetir"; status: number; response: unknown }
  | { decision: "en-curso" }
  | { decision: "conflicto" };

export type ReservaExistente = {
  bodyHash: string;
  status: number | null;
  response: unknown;
  createdAt: Date;
} | null;

/**
 * Qué hacer ante una clave que ya existe.
 *
 * Separado de la base de datos para poder probar la tabla de decisiones, que es
 * donde están los casos que importan y donde es fácil equivocarse.
 */
export function decidir(existente: ReservaExistente, huella: string): EstadoClave {
  if (!existente) return { decision: "escribir" };

  /*
   * ⚠️ El cuerpo se compara ANTES que el estado. Una clave repetida con otro
   * cuerpo es un error del cliente sea cual sea el estado de la anterior, y
   * tratarlo como reintento perdería la escritura nueva sin dejar rastro.
   */
  if (existente.bodyHash !== huella) return { decision: "conflicto" };

  /*
   * ⚠️ Reservada y sin respuesta significa «se está escribiendo ahora, o se
   * cayó a medias». Ahí se RECHAZA el reintento: no se puede saber si la
   * escritura llegó a ocurrir, y ante la duda se prefiere que el cliente vuelva
   * a preguntar a arriesgar un duplicado que nadie va a notar.
   */
  if (existente.status === null) return { decision: "en-curso" };

  return { decision: "repetir", status: existente.status, response: existente.response };
}

/** ¿Esta clave ya se puede olvidar? */
export function caducada(creada: Date, ahora: Date = new Date()): boolean {
  return ahora.getTime() - creada.getTime() > VIGENCIA_HORAS * 3_600_000;
}
