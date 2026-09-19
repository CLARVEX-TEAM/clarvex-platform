/**
 * Evaluación de capacitación: preguntas, calificación y constancia.
 *
 * Lo que ya existía era una biblioteca de recursos con registro de quién los
 * abrió. Abrir un documento no es haber aprendido, así que esto añade la parte
 * que sí se puede afirmar: contestar y aprobar.
 *
 * ⚠️ **La respuesta correcta NUNCA sale del servidor.** Es la regla que sostiene
 * todo lo demás: mandarla al teléfono para pintar el cuestionario la deja a la
 * vista de cualquiera que abra las herramientas del navegador, y entonces la
 * constancia no vale nada. Se califica aquí, con las preguntas que tiene el
 * servidor, no con lo que devuelva el cliente.
 */

export type Pregunta = {
  id: string;
  texto: string;
  opciones: string[];
  /** Índice de la opción correcta. Solo del lado del servidor. */
  correcta: number;
};

/** La misma pregunta, tal como puede viajar al teléfono. */
export type PreguntaSinRespuesta = Omit<Pregunta, "correcta">;

/** Mínimo por omisión para aprobar, en porcentaje. */
export const MINIMO_POR_OMISION = 80;

/**
 * Quita las respuestas correctas antes de mandar el cuestionario.
 *
 * ⚠️ Se construye un objeto NUEVO campo a campo, no un `delete` sobre el
 * original ni un `...resto`: así, el día que la pregunta gane un campo interno
 * --una explicación, una pista-- no se cuela solo por haberlo añadido.
 */
export function paraResponder(preguntas: Pregunta[]): PreguntaSinRespuesta[] {
  return preguntas.map((pregunta) => ({
    id: pregunta.id,
    texto: pregunta.texto,
    opciones: pregunta.opciones
  }));
}

export type Calificacion = {
  aciertos: number;
  total: number;
  /** Entero de 0 a 100. */
  porcentaje: number;
  aprobado: boolean;
};

/**
 * Califica un intento.
 *
 * ⚠️ **Las respuestas van por ID de pregunta, nunca por posición.** Con índices,
 * reordenar o insertar una pregunta califica mal a todo el mundo y en silencio:
 * nadie revisa un examen que ya dio un número.
 *
 * @param respuestas `{ idDePregunta: índiceElegido }`. Lo manda el cliente, así
 *   que lo que no se reconozca se ignora y lo que falte cuenta como fallo — no
 *   como error: dejar una en blanco es una respuesta, no una avería.
 */
export function calificar(
  preguntas: Pregunta[],
  respuestas: Record<string, unknown>,
  minimo: number = MINIMO_POR_OMISION
): Calificacion {
  const total = preguntas.length;
  if (total === 0) {
    // Un cuestionario sin preguntas no aprueba a nadie: aprobar por defecto
    // repartiría constancias por un error de captura.
    return { aciertos: 0, total: 0, porcentaje: 0, aprobado: false };
  }

  let aciertos = 0;
  for (const pregunta of preguntas) {
    const elegida = respuestas[pregunta.id];
    if (typeof elegida !== "number" || !Number.isInteger(elegida)) continue;
    if (elegida < 0 || elegida >= pregunta.opciones.length) continue;
    if (elegida === pregunta.correcta) aciertos += 1;
  }

  const porcentaje = Math.round((aciertos / total) * 100);
  return { aciertos, total, porcentaje, aprobado: porcentaje >= minimo };
}

/**
 * Si un cuestionario está bien formado, para no publicar uno que no se puede
 * aprobar.
 *
 * ⚠️ Se valida al GUARDARLO, no al contestarlo: descubrir que la respuesta
 * correcta apunta fuera de la lista mientras alguien hace el examen le hace
 * perder el intento por un error que no es suyo.
 */
export function problemasDelCuestionario(preguntas: Pregunta[]): string[] {
  const problemas: string[] = [];
  if (preguntas.length === 0) problemas.push("El cuestionario no tiene preguntas.");

  const vistos = new Set<string>();
  for (const [indice, pregunta] of preguntas.entries()) {
    const donde = `Pregunta ${indice + 1}`;
    if (!pregunta.id || vistos.has(pregunta.id)) {
      // Con ids repetidos, dos preguntas comparten respuesta y una queda sin
      // calificar sin que nadie lo note.
      problemas.push(`${donde}: identificador vacío o repetido.`);
    }
    vistos.add(pregunta.id);
    if (!pregunta.texto?.trim()) problemas.push(`${donde}: falta el enunciado.`);
    if (pregunta.opciones.length < 2) problemas.push(`${donde}: hacen falta al menos dos opciones.`);
    if (pregunta.opciones.some((opcion) => !opcion?.trim())) problemas.push(`${donde}: hay una opción vacía.`);
    if (
      !Number.isInteger(pregunta.correcta) ||
      pregunta.correcta < 0 ||
      pregunta.correcta >= pregunta.opciones.length
    ) {
      problemas.push(`${donde}: la respuesta correcta no apunta a ninguna opción.`);
    }
  }
  return problemas;
}
