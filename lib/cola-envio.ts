"use client";

import { borrar, guardar, leerTodo, type OperacionGuardada } from "@/lib/cola-almacen";
import { resumenDeLaCola, siguiente, tras, veredicto, type Veredicto } from "@/lib/cola-offline";
import { SinRed, nativeDeviceFetch } from "@/lib/native-device-client";

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
  /** Cuerpo JSON de una operación que exige firma del dispositivo. */
  json?: string;
  firmado?: boolean;
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
    nombreArchivo: encargo.nombreArchivo ?? null,
    ...(encargo.json !== undefined ? { json: encargo.json } : {}),
    ...(encargo.firmado ? { firmado: true } : {})
  };
  const guardada = await guardar(operacion);
  if (guardada) avisar();
  return guardada;
}

/**
 * El resultado de un intento, en los términos que entiende `veredicto`.
 *
 * Exportada para poder probarla: es la única parte de la cola que toca la red, y
 * lo que se le puede romper --perder la clave, perder la foto, leer mal el
 * código del 409-- no da error, solo pierde capturas.
 */
export async function intentar(op: OperacionGuardada): Promise<{ status: number | null; codigo: string | null; local?: string }> {
  let respuesta: Response;
  if (op.firmado && typeof op.json === "string") {
    try {
      respuesta = await enviarFirmada(op);
    } catch (error) {
      // No llegó a salir. Es el caso normal en la tienda, no un error.
      if (error instanceof SinRed) return { status: null, codigo: null };
      /*
       * ⚠️ Lo demás que se lance al FIRMAR es local --la APK sin el plugin de
       * identidad, una identidad que ya no existe-- y no se arregla esperando.
       * Reintentarlo atascaría la cola delante de todo lo demás, que es FIFO.
       */
      return { status: null, codigo: null, local: error instanceof Error ? error.message : "no se pudo firmar" };
    }
  } else {
    try {
      respuesta = await enviarFormulario(op);
    } catch {
      /*
       * ⚠️ Aquí un throw es SIEMPRE falta de red: `fetch` solo rechaza cuando la
       * petición no llegó a salir. Tratarlo como fallo local daría por perdida
       * la captura ante un parpadeo de señal, que es el caso más común en la
       * tienda y justo el que esta cola existe para cubrir.
       */
      return { status: null, codigo: null };
    }
  }

  /*
   * ⚠️ El `codigo` se lee del CUERPO, no del texto del error. Los dos 409 del
   * candado de idempotencia significan lo contrario y distinguirlos por una
   * frase ataría la cola a algo que alguien reescribirá.
   */
  // El `clone()` es defensivo: hoy nadie lee el cuerpo después de esto, así que
  // ninguna prueba puede demostrar que haga falta. Se conserva para que quien
  // añada esa lectura no se encuentre el flujo ya consumido.
  let codigo: string | null = null;
  try {
    const cuerpo = await respuesta.clone().json() as { codigo?: unknown };
    if (typeof cuerpo?.codigo === "string") codigo = cuerpo.codigo;
  } catch {
    // Una respuesta sin JSON no es un problema: el status ya decide.
  }

  return { status: respuesta.status, codigo };
}

function enviarFormulario(op: OperacionGuardada): Promise<Response> {
  const form = new FormData();
  for (const [nombre, valor] of op.campos) {
    if (typeof valor === "string") form.append(nombre, valor);
    else form.append(nombre, valor, op.nombreArchivo ?? "archivo");
  }
  return fetch(op.ruta, { method: "POST", body: form, headers: { "Idempotency-Key": op.id } });
}

/**
 * Pide reto y FIRMA ahora, no cuando se capturó.
 *
 * ⚠️ El reto es de un solo uso y la firma vale dos minutos: una firma guardada
 * llegaría vencida. Firmar al enviar no relaja la protección --el aparato prueba
 * posesión en el momento en que de verdad manda, que es lo que la ventana
 * cubre-- pero sí obliga a que haya red, y por eso `SinRed` sale de aquí.
 *
 * ⚠️ `Idempotency-Key` viaja FUERA de lo que firma el dispositivo, que cubre
 * método, ruta y cuerpo. No abre nada: el reto de un solo uso ya impide repetir
 * la petición, y lo peor que haría cambiarla es provocar un rechazo.
 */
function enviarFirmada(op: OperacionGuardada): Promise<Response> {
  return nativeDeviceFetch(op.ruta, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": op.id },
    body: op.json ?? ""
  });
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

      const { status, codigo, local } = await intentar(op);
      const fallo: Veredicto = local ? { decision: "rendirse", motivo: local } : veredicto(status, codigo);
      const despues = tras(op, fallo);

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
