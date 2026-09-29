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
export function resumirTienda(filas: FilaKpi[], miUserId: string): VentaDeTienda | null {
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

  const personas = filas
    .map((fila) => ({ nombre: fila.nombre, venta: fila.venta, esTuyo: fila.userId === miUserId }))
    /*
     * Por venta y, a igualdad, por nombre. El desempate por nombre no es un
     * adorno: sin él, dos personas en cero se ordenan como las devuelva la base
     * y la lista baila de una carga a otra sin que nada haya cambiado.
     */
    .sort((a, b) => b.venta - a.venta || a.nombre.localeCompare(b.nombre, "es"));

  return { venta, meta, tickets, piezas, capturadas: filas.length, personas };
}
