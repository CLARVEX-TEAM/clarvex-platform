import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { claveValida, decidir, huellaDelCuerpo } from "@/lib/idempotencia";

/**
 * Envuelve una escritura para que un reintento no la repita.
 *
 * ⚠️ **La reserva se inserta ANTES de escribir.** Guardar la respuesta al final
 * no basta: dos intentos simultáneos --el de la cola y el del botón-- pasarían
 * los dos por el hueco entre la consulta y la escritura. El índice único es el
 * único árbitro fiable.
 *
 * ⚠️ **Y se RELEE después del choque, nunca se confía en el resultado del
 * intento.** Es la misma lección que costó el `ack` de Slack: un INSERT que
 * luego se revierte dejaba creer que se había creado algo.
 *
 * ⚠️ Sin clave, la escritura corre tal cual. La idempotencia se AÑADE a quien
 * la pide, no se impone: obligarla rompería a todo lo que ya escribe hoy.
 */
/*
 * ⚠️ Los dos 409 llevan `codigo` porque significan lo CONTRARIO para quien
 * reintenta: «en-curso» hay que volver a intentarlo, «clave-repetida» no se va a
 * arreglar nunca. Distinguirlos leyendo el texto del error ataría la cola a una
 * frase que alguien reescribirá.
 */
export type Respuesta = { status: number; body: unknown };

export type ResultadoIdempotente = Respuesta & {
  /** `true` cuando esta respuesta salió de una escritura anterior. */
  repetida: boolean;
};

export async function conIdempotencia(
  contexto: { clave: string | null; storeId: string; userId: string; route: string; cuerpo: unknown },
  escribir: () => Promise<Respuesta>
): Promise<ResultadoIdempotente> {
  const { clave, storeId, userId, route, cuerpo } = contexto;

  if (!clave) {
    const salida = await escribir();
    return { ...salida, repetida: false };
  }
  if (!claveValida(clave)) {
    return {
      status: 400,
      body: { error: "La clave de la operación no tiene un formato válido." },
      repetida: false
    };
  }

  const bodyHash = huellaDelCuerpo(cuerpo);

  let reservada = false;
  try {
    await prisma.idempotentWrite.create({
      data: { key: clave, storeId, userId, route, bodyHash, status: null, response: Prisma.DbNull }
    });
    reservada = true;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }

  if (!reservada) {
    // La relectura es la que manda: el choque solo dice que alguien llegó antes.
    const existente = await prisma.idempotentWrite.findUnique({
      where: { storeId_key: { storeId, key: clave } },
      select: { bodyHash: true, status: true, response: true, createdAt: true }
    });
    const decision = decidir(existente ?? null, bodyHash);

    if (decision.decision === "repetir") {
      return { status: decision.status, body: decision.response, repetida: true };
    }
    if (decision.decision === "conflicto") {
      return {
        status: 409,
        body: { error: "Esa clave ya se usó para otra operación distinta.", codigo: "clave-repetida" },
        repetida: false
      };
    }
    if (decision.decision === "en-curso") {
      return {
        status: 409,
        body: { error: "Esa operación se está guardando. Vuelve a consultar antes de reintentar.", codigo: "en-curso" },
        repetida: false
      };
    }
    // `escribir`: la reserva desapareció entre el choque y la relectura.
  }

  let salida: Respuesta;
  try {
    salida = await escribir();
  } catch (error) {
    /*
     * ⚠️ Si la escritura revienta, se SUELTA la reserva.
     *
     * El cliente tampoco recibió respuesta, así que va a reintentar. Dejando la
     * reserva puesta, ese reintento chocaría contra «en curso» para siempre y la
     * operación quedaría muerta sin forma de repetirla.
     *
     * El riesgo que queda escrito: si reventó DESPUÉS de haber escrito, el
     * reintento duplica. Se elige así porque una excepción antes de responder
     * casi siempre es una transacción que no llegó a confirmarse, y una
     * operación imposible de reintentar es un problema seguro frente a un
     * duplicado improbable.
     */
    await prisma.idempotentWrite
      .deleteMany({ where: { storeId, key: clave, status: null } })
      .catch(() => undefined);
    throw error;
  }

  await prisma.idempotentWrite
    .update({
      where: { storeId_key: { storeId, key: clave } },
      data: { status: salida.status, response: (salida.body ?? Prisma.DbNull) as Prisma.InputJsonValue }
    })
    .catch(() => {
      // Guardar la respuesta es lo ÚLTIMO y no puede tumbar una escritura que
      // ya ocurrió. Si falla, el reintento chocará con «en curso», que es el
      // lado seguro: mejor que el cliente pregunte a que duplique.
      console.warn(`[idempotencia] no se pudo guardar la respuesta de ${route}`);
    });

  return { ...salida, repetida: false };
}

/** La clave viaja en la cabecera estándar. */
export function claveDeLaPeticion(request: Request): string | null {
  return request.headers.get("Idempotency-Key")?.trim() || null;
}
