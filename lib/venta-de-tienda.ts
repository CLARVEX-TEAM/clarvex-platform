/**
 * La venta de TIENDA del día, para la tarjeta de gerencia en «Mi día».
 *
 * ⚠️ **Por qué existe.** El recuadro de «Mi día» consulta el KPI de la persona
 * --`userId: session.userId`-- y eso vale para un asesor, pero no para
 * gerencia: su comisión se calcula sobre la venta de TIENDA contra el mínimo de
 * tienda, no sobre la suya. La única pantalla que abren a diario no llevaba la
 * cifra por la que se les mide.
 *
 * ⚠️ **Y el candado es del SERVIDOR.** Esto solo se calcula y solo se manda si
 * quien pregunta es gerencia. Mandarlo siempre y esconderlo en la pantalla
 * dejaría la venta de la tienda dentro de la respuesta que recibe un asesor, a
 * un «ver el tráfico de red» de distancia. Es la regla de roles de siempre: un
 * asesor no ve ventas ni metas que no sean las suyas.
 */

/** Una fila de `Kpi` del día, ya con el nombre de su persona. */
export type FilaKpi = {
  userId: string;
  nombre: string;
  venta: number;
  meta: number;
  tickets: number;
  piezas: number;
};

export type PersonaDeTienda = {
  nombre: string;
  venta: number;
  /** Para destacar tu propia fila dentro de la lista. */
  esTuyo: boolean;
};

/** Los estatus de horario que cuentan como estar en el piso. */
const LABORA = new Set(["WORKING", "INVENTORY"]);

/**
 * Quién está en turno hoy, a partir de las filas de `Schedule` de la tienda.
 *
 * ⚠️ Mismo criterio que `lib/working-today.ts`: **conteo también es laborar**.
 * Ese día venden y tienen meta, así que su venta cuenta igual que la de
 * cualquier otro; dejarlo fuera escondería ventas reales.
 *
 * ⚠️ **`null` si la tienda no tiene horario cargado ese día**, y entonces no se
 * filtra nada. Un horario que todavía no se ha capturado no es «no trabaja
 * nadie»: filtrando por él, la tarjeta se quedaría vacía los días en que
 * gerencia aún no ha subido el horario, que es justo cuando más se mira.
 */
export function enTurnoHoy(horarios: { userId: string; status: string }[]): Set<string> | null {
  if (horarios.length === 0) return null;
  return new Set(horarios.filter((h) => LABORA.has(h.status)).map((h) => h.userId));
}

export type VentaDeTienda = {
  venta: number;
  meta: number;
  tickets: number;
  piezas: number;
  /** Cuántas personas tienen fila hoy. Nunca cero: sin filas esto es `null`. */
  capturadas: number;
  personas: PersonaDeTienda[];
};

/**
 * Suma el día de la tienda a partir de las filas de su gente.
 *
 * ⚠️ **El total sale de las MISMAS filas que se enseñan**, no de un `aggregate`
 * aparte. Con dos consultas distintas, un filtro que se toque en una y no en la
 * otra deja la tarjeta contradiciéndose: un total que no cuadra con la lista que
 * tiene debajo. Y quien lo note no va a saber cuál de los dos números vale.
 *
 * ⚠️ **`null` cuando no hay ninguna fila, que NO es lo mismo que cero.** Una
 * tienda que todavía no ha capturado y una que lleva $0 vendidos se ven igual
 * si las dos pintan «$0.00», y son cosas opuestas: la primera no sabe nada, la
 * segunda sabe que no ha vendido. Es lo mismo que el proyecto ya decidió con
 * `tieneCaptura()` para los avisos del agente de tienda.
 */
export function resumirTienda(
  filas: FilaKpi[],
  miUserId: string,
  enTurno: Set<string> | null = null
): VentaDeTienda | null {
  if (filas.length === 0) return null;

  /*
   * ⚠️ La venta puede ser NEGATIVA y se conserva tal cual. Una devolución de
   * cliente que no se compensa con otra venta deja el día en rojo, y así se
   * registra en toda la app. Recortarla a cero aquí haría que el total de la
   * tarjeta no cuadrara con el de Retool ni con el del reporte del POS.
   */
  const venta = filas.reduce((suma, fila) => suma + fila.venta, 0);
  const meta = filas.reduce((suma, fila) => suma + fila.meta, 0);

  /*
   * ⚠️ Los conteos van en ENTERO: las piezas de `Kpi` son brutas --el POS
   * reporta las devoluciones aparte-- y un ticket negativo no existe. Es la
   * misma distinción que ya está escrita para la captura.
   */
  const tickets = filas.reduce((suma, fila) => suma + fila.tickets, 0);
  const piezas = filas.reduce((suma, fila) => suma + fila.piezas, 0);

  /*
   * ⚠️ **La LISTA es de quien está en turno; los TOTALES son de la tienda.**
   *
   * Guardar Cuota Justa escribe la meta diaria de toda la semana por adelantado
   * --con venta, tickets y piezas en cero--, así que todo el equipo tiene fila
   * todos los días y la lista salía con las cinco personas en `$0.00`, incluida
   * la que descansa. Eso no informa: la pregunta de gerencia al abrir «Mi día»
   * es cómo va quien está vendiendo AHORA.
   *
   * ⚠️ **Pero quien tenga operación se queda, aunque el horario diga que no
   * labora.** Una venta que existe tiene que verse: es la única forma de que la
   * suma de las filas visibles siga cuadrando con el total de arriba. Y si
   * alguien vendió en su día de descanso, esconderlo convertiría un descuadre
   * de horario --que hay que corregir-- en una cifra que nadie puede explicar.
   *
   * Corolario: todo el que se filtra lleva venta, tickets y piezas en CERO, así
   * que quitarlo no mueve ninguno de los totales de arriba. La única cifra que
   * incluye a los ausentes es la META, y esa es de tienda a propósito: gerencia
   * se mide contra la meta de la tienda entera, trabaje quien trabaje.
   */
  const visibles = enTurno
    ? filas.filter((fila) => enTurno.has(fila.userId) || fila.venta !== 0 || fila.tickets !== 0 || fila.piezas !== 0)
    : filas;

  const personas = visibles
    .map((fila) => ({ nombre: fila.nombre, venta: fila.venta, esTuyo: fila.userId === miUserId }))
    /*
     * Por venta y, a igualdad, por nombre. El desempate por nombre no es un
     * adorno: sin él, dos personas en cero se ordenan como las devuelva la base
     * y la lista baila de una carga a otra sin que nada haya cambiado.
     */
    .sort((a, b) => b.venta - a.venta || a.nombre.localeCompare(b.nombre, "es"));

  return { venta, meta, tickets, piezas, capturadas: filas.length, personas };
}
