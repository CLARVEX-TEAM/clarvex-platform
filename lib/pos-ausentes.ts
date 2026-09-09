/**
 * Quién trabajó ese día y NO aparece en el reporte del POS.
 *
 * ⚠️ **Es la única red contra una fila que el lector nunca vio.**
 *
 * Las cuatro cuentas de `rowProblems` se comprueban DENTRO de cada fila: bruto
 * menos descuento, menos devoluciones, y los dos promedios. Son buenas contra
 * un dígito mal leído, y no valen absolutamente nada contra una fila entera que
 * no se leyó: las que quedan cuadran perfecto y el día se captura de menos.
 *
 * Tampoco lo cubre `unmatched`, que solo habla de nombres que SÍ se leyeron y
 * no se pudieron emparejar. Una fila que no se leyó no deja ningún nombre que
 * reportar. Desde fuera, ese día se ve idéntico a uno en que esa persona
 * descansaba.
 *
 * Lo que sí sabe Clarvex, y el lector no, es **quién estaba en el piso**. Ese
 * dato viene del horario, que se captura aparte y por otra vía, así que es una
 * segunda opinión de verdad y no la misma lectura mirándose al espejo.
 *
 * ⚠️ **Avisa; no detiene.** Se puede trabajar un día entero y no vender nada
 * —un martes flojo, alguien en inventario, alguien cubriendo probadores—, y
 * bloquear la captura por eso dejaría a la tienda sin poder capturar un día
 * legítimo. La pregunta la contesta quien tiene el reporte delante.
 */

/** Los estados de horario en los que se está en el piso y se puede vender. */
export const EN_EL_PISO = ["WORKING", "INVENTORY"] as const;

export type PersonaEnHorario = {
  userId: string;
  name: string;
  status: string;
};

/**
 * Los nombres de quienes trabajaron y no vienen en el reporte.
 *
 * @param horario  el horario de ESE día, tal como está capturado
 * @param conVenta los ids que sí aparecieron en el reporte y se emparejaron
 */
export function quienFaltaEnElReporte(horario: PersonaEnHorario[], conVenta: Iterable<string>): string[] {
  /*
   * ⚠️ **Sin horario capturado no se dice nada.**
   *
   * «No hay horario» no es «no trabajó nadie». Avisar de los cinco cada vez que
   * el horario va con retraso convierte el aviso en ruido, y un aviso que
   * siempre sale es un aviso que ya nadie lee — justo el día que señala algo.
   */
  if (horario.length === 0) return [];

  const aparecieron = new Set(conVenta);
  const enElPiso = new Set<string>(EN_EL_PISO);

  return horario
    .filter((persona) => enElPiso.has(persona.status) && !aparecieron.has(persona.userId))
    .map((persona) => persona.name)
    .sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * El aviso, ya redactado, o `null` si no hay nada que avisar.
 *
 * Va como PREGUNTA y no como afirmación: desde aquí no se puede saber si esa
 * persona no vendió o si su renglón se perdió. Afirmar lo segundo mandaría a
 * revisar un reporte que estaba bien; no decir nada deja pasar el que no lo
 * estaba.
 */
export function avisoDeAusentes(nombres: string[]): string | null {
  if (nombres.length === 0) return null;
  const quienes = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  const verbo = nombres.length === 1 ? "trabajó" : "trabajaron";
  const suyo = nombres.length === 1 ? "su renglón" : "sus renglones";
  return `${quienes} ${verbo} ese día y no ${nombres.length === 1 ? "aparece" : "aparecen"} en el reporte. Comprueba en la captura que ${suyo} ${nombres.length === 1 ? "esté" : "estén"}: si el reporte no cabe entero en la pantalla, la lectura se queda con lo que se ve y el día entra con menos piezas.`;
}
