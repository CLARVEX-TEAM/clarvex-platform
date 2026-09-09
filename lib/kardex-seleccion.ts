import { signedQuantity, type InventoryMovementType } from "@/lib/inventory-kardex-entry";

/**
 * Sumar a mano un puñado de movimientos del kardex, como se haría en Excel.
 *
 * Nace de una petición concreta de la tienda: «filtro por entregas y quiero
 * saber cuántas fueron por día; selecciono las filas de unos días y ya sé
 * cuántas son». Es exactamente lo que se hacía marcando celdas en la hoja, y no
 * hay pantalla que lo cubra: el resumen del kardex da los totales de la ronda
 * entera, no los de tres días sueltos.
 *
 * ⚠️ **La suma cruda de `quantity` NO significa nada.** Las piezas se guardan
 * siempre en positivo y el sentido lo pone el TIPO (ver `signedQuantity`), así
 * que sumar una recepción de 40 con un traspaso de salida de 10 da 50 —un
 * número que no es ni lo que entró, ni lo que salió, ni el saldo—. Por eso
 * `resumirSeleccion` devuelve las tres cosas por separado y avisa cuando la
 * selección mezcla sentidos: enseñar un solo total ahí sería inventar un dato.
 */

export type MovimientoSeleccionable = {
  id: string;
  /** `YYYY-MM-DD`, tal como la manda la API. */
  date: string;
  type: string;
  /** Siempre positiva; el signo lo pone el tipo. */
  quantity: number;
};

export type ResumenDia = {
  date: string;
  filas: number;
  /** Lo que entró ese día dentro de la selección. */
  entradas: number;
  /** Lo que salió ese día dentro de la selección, en positivo. */
  salidas: number;
  /** `entradas - salidas`. */
  neto: number;
};

export type ResumenSeleccion = {
  filas: number;
  entradas: number;
  /** En POSITIVO: son piezas que salieron, no una resta pendiente. */
  salidas: number;
  neto: number;
  /**
   * ⚠️ `true` cuando la selección mezcla movimientos de entrada y de salida.
   *
   * No es un error —puede querer verse el saldo de unos días— pero la pantalla
   * no debe enseñar «X piezas» a secas: ahí la única cifra honesta son las tres.
   */
  mezcla: boolean;
  /** Un renglón por día con algo seleccionado, del más viejo al más nuevo. */
  porDia: ResumenDia[];
  /** Los tipos presentes en la selección, para poder nombrarlos en pantalla. */
  tipos: string[];
};

/**
 * ¿Este movimiento suma al inventario?
 *
 * Un tipo desconocido —uno nuevo que llegara de la API sin que esta pantalla se
 * enterara— se trata como ENTRADA y se declara en `tiposDesconocidos`. Elegir
 * un sentido a ciegas es inevitable para poder sumar algo; lo que no se puede
 * es hacerlo callando.
 */
export function esEntrada(type: string): boolean {
  return signedQuantity(type as InventoryMovementType, 1) >= 0;
}

/** Los tipos de la lista que esta versión no sabe interpretar. */
export function tiposDesconocidos(movimientos: MovimientoSeleccionable[], conocidos: string[]): string[] {
  const set = new Set(conocidos);
  const raros = new Set(movimientos.map((m) => m.type).filter((t) => !set.has(t)));
  return [...raros].sort();
}

/**
 * El resumen de lo seleccionado.
 *
 * ⚠️ **Solo mira lo que recibe.** Filtrar y seleccionar son cosas distintas: si
 * la pantalla filtra por tipo y luego se marcan filas, aquí solo llegan las
 * marcadas. Sumar «lo filtrado» y «lo marcado» a la vez es cómo se acaba
 * enseñando un total que no corresponde a nada de lo que se ve.
 */
export function resumirSeleccion(movimientos: MovimientoSeleccionable[]): ResumenSeleccion {
  const porDia = new Map<string, ResumenDia>();
  let entradas = 0;
  let salidas = 0;
  const tipos = new Set<string>();

  for (const movimiento of movimientos) {
    // Una cantidad que no es un número finito no se cuenta ni como cero: se
    // ignora la fila entera. Sumarle 0 dejaría el conteo de filas mintiendo.
    if (!Number.isFinite(movimiento.quantity)) continue;

    const piezas = Math.abs(movimiento.quantity);
    const suma = esEntrada(movimiento.type);
    tipos.add(movimiento.type);

    const dia = porDia.get(movimiento.date) ?? {
      date: movimiento.date,
      filas: 0,
      entradas: 0,
      salidas: 0,
      neto: 0
    };
    dia.filas += 1;
    if (suma) {
      dia.entradas += piezas;
      entradas += piezas;
    } else {
      dia.salidas += piezas;
      salidas += piezas;
    }
    dia.neto = dia.entradas - dia.salidas;
    porDia.set(movimiento.date, dia);
  }

  return {
    filas: [...porDia.values()].reduce((total, dia) => total + dia.filas, 0),
    entradas,
    salidas,
    neto: entradas - salidas,
    mezcla: entradas > 0 && salidas > 0,
    porDia: [...porDia.values()].sort((a, b) => a.date.localeCompare(b.date)),
    tipos: [...tipos].sort()
  };
}

/**
 * Los ids que van del uno al otro, en el ORDEN EN QUE SE VEN.
 *
 * Es lo que hace shift+clic en una hoja de cálculo. Se toma la lista ya
 * filtrada y ordenada como está en pantalla: usar el orden de la base
 * seleccionaría filas que no se están viendo, que es justo lo que rompe la
 * confianza en un total.
 *
 * El orden de los dos extremos da igual —se puede marcar de abajo hacia
 * arriba— y un id que no esté en la lista devuelve solo el otro.
 */
export function rangoVisible(idsEnPantalla: string[], desde: string, hasta: string): string[] {
  const a = idsEnPantalla.indexOf(desde);
  const b = idsEnPantalla.indexOf(hasta);
  if (a === -1 && b === -1) return [];
  if (a === -1) return [hasta];
  if (b === -1) return [desde];
  const [inicio, fin] = a <= b ? [a, b] : [b, a];
  return idsEnPantalla.slice(inicio, fin + 1);
}
