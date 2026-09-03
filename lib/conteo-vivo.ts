/**
 * La huella del conteo del día: un texto corto que cambia si cambió algo.
 *
 * Sirve para no traer el estado completo cada pocos segundos. La pantalla
 * compara la huella con la que ya tenía y solo vuelve a pedir los datos cuando
 * son distintas.
 *
 * ⚠️ **NO lleva ninguna cantidad.** El conteo es ciego: lo que otra persona
 * acaba de teclear es justo lo que no puede salir de la base. La huella se hace
 * con cuántos conteos hay y cuándo fue el último, que es todo lo que hace falta
 * para saber que hay novedades.
 */

export type MarcasDeEntrada = {
  tagId: string;
  count1At: Date | null;
  count2At: Date | null;
  count3At: Date | null;
};

export function huellaDelDia(entradas: MarcasDeEntrada[]): string {
  let capturas = 0;
  let ultimo = 0;

  for (const e of entradas) {
    for (const marca of [e.count1At, e.count2At, e.count3At]) {
      if (!marca) continue;
      capturas += 1;
      const t = marca.getTime();
      if (t > ultimo) ultimo = t;
    }
  }

  /*
   * Van los DOS datos, y ninguno sobra:
   *
   * - Solo el último instante no detecta que alguien BORRE una captura: la
   *   marca desaparece y la más reciente de las que quedan es anterior, así que
   *   la huella iría hacia atrás — pero un recuento corregido a la baja podría
   *   dejarla exactamente igual que antes.
   * - Solo el conteo de capturas no detecta que alguien CORRIJA un marbete ya
   *   contado: siguen siendo las mismas capturas.
   *
   * Juntos cubren los dos casos: corregir mueve el instante, borrar mueve el
   * número, y añadir mueve los dos.
   */
  return `${entradas.length}:${capturas}:${ultimo}`;
}
