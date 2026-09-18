"use client";

import { borrar, guardar, leerTodo, type OperacionGuardada } from "@/lib/cola-almacen";
import { resumenDeLaCola, siguiente, tras, veredicto } from "@/lib/cola-offline";

/**
 * Quien de verdad manda lo que la cola decidió.
 *
 * Las decisiones están en `lib/cola-offline`, sin navegador, porque es lo único
 * que se puede probar. Aquí solo queda la fontanería: reconstruir el formulario,
 * mandarlo y guardar lo que salga.
 */

/** Cambió el contenido de la cola: la franja de arriba se vuelve a contar. */
export const EVENTO_CAMBIO = "clarvex-cola";

/**
 * Una operación llegó de verdad al servidor.
 *
 * ⚠️ **Son dos eventos y no uno.** La franja se recuenta muchas veces --es una
 * lectura local y barata--, pero una pantalla que se recargue con cada uno
 * dispara una petición por paso de la cola. Solo lo entregado justifica ir al
 * servidor.
 */
export const EVENTO_ENTREGA = "clarvex-cola-entregada";

function avisar(evento: string = EVENTO_CAMBIO): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(evento));
}

export type Encargo = {
  ruta: string;
  etiqueta: string;
  campos: Array<[string, string | Blob]>;
  nombreArchivo?: string | null;
};

/**
 * ⚠️ **La clave nace AQUÍ y no cambia nunca.** Es lo que hace que reintentar no
 * duplique: el servidor reconoce el segundo intento por ella. Generarla en cada
 * envío convertiría la cola en una máquina de duplicar.
 */
function clave(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Respaldo para WebViews viejos: `randomUUID` exige contexto seguro.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Devuelve `false` si ni siquiera se pudo encolar, para poder DECIRLO. */
export async function encolar(encargo: Encargo): Promise<boolean> {
  const operacion: OperacionGuardada = {
    id: clave(),
    creada: Date.now(),
    ruta: encargo.ruta,
    etiqueta: encargo.etiqueta,
    intentos: 0,
    ultimoError: null,
    estado: "pendiente",
    campos: encargo.campos,
    nombreArchivo: encargo.nombreArchivo ?? null
  };
  const guardada = await guardar(operacion);
  if (guardada) avisar();
  return guardada;
}

/** El resultado de un intento, en los términos que entiende `veredicto`. */
async function intentar(op: OperacionGuardada): Promise<{ status: number | null; codigo: string | null }> {
  const form = new FormData();
  for (const [nombre, valor] of op.campos) {
    if (typeof valor === "string") form.append(nombre, valor);
    else form.append(nombre, valor, op.nombreArchivo ?? "archivo");
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(op.ruta, {
      method: "POST",
      body: form,
      headers: { "Idempotency-Key": op.id }
    });
  } catch {
    // No llegó a salir. Es el caso normal en la tienda, no un error.
    return { status: null, codigo: null };
  }

  /*
   * ⚠️ El `codigo` se lee del CUERPO, no del texto del error. Los dos 409 del
   * candado de idempotencia significan lo contrario y distinguirlos por una
   * frase ataría la cola a algo que alguien reescribirá.
   */
  let codigo: string | null = null;
  try {
    const cuerpo = await respuesta.clone().json() as { codigo?: unknown };
    if (typeof cuerpo?.codigo === "string") codigo = cuerpo.codigo;
  } catch {
    // Una respuesta sin JSON no es un problema: el status ya decide.
  }

  return { status: respuesta.status, codigo };
}

let drenando = false;

/**
 * Vacía la cola, una operación a la vez y en orden.
 *
 * ⚠️ **Una sola a la vez y sin adelantar a la que falla.** Dos operaciones del
 * mismo ítem pueden ser «márcalo» y luego «desmárcalo»; mandarlas en paralelo o
 * saltándose la primera deja el checklist al revés de como lo dejó la persona.
 *
 * ⚠️ **Y nunca por temporizador.** Se llama al volver la conexión, al volver a
 * la app y al montar. Insistir cada X segundos gastaría batería sin ninguna
 * señal de que algo haya cambiado --es la regla de esta casa.
 */
export async function drenar(): Promise<void> {
  if (drenando) return;
  drenando = true;
  try {
    let cola = await leerTodo();

    for (;;) {
      const op = siguiente(cola);
      if (!op) break;

      const { status, codigo } = await intentar(op);
      const despues = tras(op, veredicto(status, codigo));

      if (despues === null) {
        await borrar(op.id);
        cola = cola.filter((otra) => otra.id !== op.id);
        avisar(EVENTO_ENTREGA);
      } else {
        const actualizada = { ...op, ...despues } as OperacionGuardada;
        await guardar(actualizada);
        cola = cola.map((otra) => (otra.id === op.id ? actualizada : otra));
        // Sigue pendiente: no hay red o el servidor no está. Parar aquí y
        // esperar al siguiente evento; insistir ahora mismo no cambia nada.
        if (actualizada.estado === "pendiente") break;
      }
      avisar();
    }
  } finally {
    drenando = false;
    avisar();
  }
}

export async function resumen(): Promise<ReturnType<typeof resumenDeLaCola>> {
  return resumenDeLaCola(await leerTodo());
}

/** Olvida las que se dieron por perdidas, cuando la persona ya las rehizo. */
export async function olvidarFallidas(): Promise<void> {
  const cola = await leerTodo();
  for (const op of cola) {
    if (op.estado === "fallida") await borrar(op.id);
  }
  avisar();
}
