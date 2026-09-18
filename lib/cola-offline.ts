/**
 * La cola de lo que se capturó sin conexión.
 *
 * Aquí viven las DECISIONES —qué se reintenta, qué se da por perdido, en qué
 * orden— separadas de IndexedDB y del navegador, que es lo único que se puede
 * probar. La tienda trabaja con señal intermitente y esto decide si una
 * evidencia acaba llegando o se pierde en silencio.
 *
 * ⚠️ **Nada de esto sirve sin la clave de idempotencia.** Cada operación
 * encolada lleva la suya desde que nace y la conserva en cada intento: es lo que
 * hace que reintentar no duplique. Ver `lib/idempotencia`.
 */

export type EstadoOperacion = "pendiente" | "fallida";

export type OperacionEnCola = {
  /** La clave de idempotencia. Nace con la operación y NO cambia al reintentar. */
  id: string;
  /** Epoch en ms. Marca el orden: la cola es estrictamente FIFO. */
  creada: number;
  ruta: string;
  /** Lo que se le enseña a la persona: «Foto de Abrir caja». */
  etiqueta: string;
  intentos: number;
  ultimoError: string | null;
  estado: EstadoOperacion;
};

export type Veredicto =
  | { decision: "listo" }
  | { decision: "reintentar"; motivo: string }
  | { decision: "rendirse"; motivo: string };

/**
 * Qué hacer con el resultado de un intento.
 *
 * ⚠️ **Reintentar para siempre es tan malo como rendirse a la primera.** Una
 * operación que nunca va a funcionar —un ítem que ya no existe, una sesión de
 * otra tienda— atascaría la cola delante de todo lo demás. Y darse por vencido
 * ante un corte de red perdería lo que la tienda capturó.
 *
 * @param status `null` cuando la petición no llegó a salir (sin red).
 */
export function veredicto(status: number | null, codigo?: string | null): Veredicto {
  // Sin respuesta: no salió de aquí. Es el caso normal en la tienda.
  if (status === null) return { decision: "reintentar", motivo: "sin conexión" };

  if (status >= 200 && status < 300) return { decision: "listo" };

  /*
   * ⚠️ Los dos 409 del candado de idempotencia significan lo contrario.
   * «en-curso» es «pregunta otra vez»; «clave-repetida» no se arregla nunca,
   * porque esa clave ya se gastó en otra operación.
   */
  if (status === 409) {
    if (codigo === "en-curso") return { decision: "reintentar", motivo: "se está guardando" };
    if (codigo === "clave-repetida") return { decision: "rendirse", motivo: "la clave ya se usó para otra cosa" };
    return { decision: "rendirse", motivo: "conflicto" };
  }

  // Tiempo agotado y «demasiadas peticiones» son temporales por definición.
  if (status === 408 || status === 429) return { decision: "reintentar", motivo: "el servidor pidió esperar" };

  if (status >= 500) return { decision: "reintentar", motivo: "el servidor falló" };

  /*
   * ⚠️ El 401 se REINTENTA, y es la excepción que este proyecto ya pagó cara:
   * «401 es todavía no sé, no no hay nada». Al abrir la app el registro del
   * aparato se rechazaba con 401 porque aún no había sesión, y darlo por
   * definitivo perdía el token para siempre.
   */
  if (status === 401) return { decision: "reintentar", motivo: "sesión todavía no lista" };

  return { decision: "rendirse", motivo: `el servidor la rechazó (${status})` };
}

/**
 * Lo siguiente que hay que mandar.
 *
 * ⚠️ **Estrictamente FIFO y sin saltarse a la que falla.** Dos operaciones del
 * mismo ítem pueden ser «márcalo» y luego «desmárcalo»: mandarlas en otro orden
 * deja el checklist al revés de como lo dejó la persona. Por eso una pendiente
 * atascada detiene la cola en vez de que se le adelante la siguiente.
 */
export function siguiente<T extends OperacionEnCola>(cola: T[]): T | null {
  const pendientes = cola.filter((op) => op.estado === "pendiente").sort((a, b) => a.creada - b.creada);
  return pendientes[0] ?? null;
}

/** Lo que hay que enseñarle a la persona, sin que tenga que abrir nada. */
export function resumenDeLaCola(cola: OperacionEnCola[]): {
  pendientes: number;
  fallidas: number;
  /** El texto de la barra, o vacío cuando no hay nada que decir. */
  aviso: string;
} {
  const pendientes = cola.filter((op) => op.estado === "pendiente").length;
  const fallidas = cola.filter((op) => op.estado === "fallida").length;

  /*
   * ⚠️ Las fallidas se nombran SIEMPRE, aunque no haya pendientes. Una captura
   * que no llegó y no se dice es exactamente el fallo que esta app lleva todo
   * el día persiguiendo: la persona cree que quedó guardada.
   */
  if (fallidas > 0 && pendientes > 0) {
    return { pendientes, fallidas, aviso: `${pendientes} sin enviar y ${fallidas} que no se pudieron guardar.` };
  }
  if (fallidas > 0) {
    return { pendientes, fallidas, aviso: `${fallidas} captura(s) no se pudieron guardar. Vuelve a hacerlas.` };
  }
  if (pendientes > 0) {
    return { pendientes, fallidas, aviso: `${pendientes} captura(s) esperando conexión.` };
  }
  return { pendientes, fallidas, aviso: "" };
}

/**
 * Aplica el veredicto a la operación.
 *
 * Devuelve `null` cuando ya no tiene que seguir en la cola.
 */
export function tras(op: OperacionEnCola, resultado: Veredicto): OperacionEnCola | null {
  if (resultado.decision === "listo") return null;
  return {
    ...op,
    intentos: op.intentos + 1,
    ultimoError: resultado.motivo,
    estado: resultado.decision === "rendirse" ? "fallida" : "pendiente"
  };
}

