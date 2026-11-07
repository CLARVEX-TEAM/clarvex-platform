/**
 * El reporte de venta que gerencia manda los sábados y domingos a las 3 y a
 * las 6, EXACTAMENTE con el formato que pide la plaza:
 *
 *   San Agustin
 *   Meta:$44,194.49
 *   Mínimo:$38,429.99
 *   Venta:$25,756.99
 *   Alcance:58
 *   TC:15%
 *
 * ⚠️ Sin espacios tras los dos puntos, sin negritas y sin emojis: se copia y se
 * pega tal cual en otro grupo, y cualquier marca de formato viajaría pegada.
 *
 * Todo es del DÍA. Comprobado contra el ejemplo de Adrián del 7 nov 2026:
 * la meta es la suma de metas del día, el mínimo es la meta entre 1.15 (el
 * mismo 15 % de Cuota Justa), el alcance es venta ÷ meta sin decimales y el TC
 * es tickets ÷ tráfico, como en la app.
 */

const MONEDA = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dinero = (n: number) => `$${MONEDA.format(n)}`;

/** «TH SAN AGUSTIN» → «San Agustin»: sin la marca y en tipo título, como lo escriben. */
export function nombreCorto(tienda: string): string {
  const palabras = tienda.trim().split(/\s+/);
  const sinMarca = palabras.length > 1 && palabras[0].length <= 3 ? palabras.slice(1) : palabras;
  return sinMarca.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

export function reporteDeVenta(opciones: {
  tienda: string;
  meta: number;
  /** Porcentaje de Cuota Justa sobre el mínimo (15 por omisión). */
  uplift?: number;
  venta: number;
  tickets: number;
  trafico: number;
}): string {
  const minimo = opciones.meta / (1 + (opciones.uplift ?? 15) / 100);
  const alcance = opciones.meta > 0 ? Math.round((opciones.venta / opciones.meta) * 100) : 0;
  const tc = opciones.trafico > 0 ? Math.round((opciones.tickets / opciones.trafico) * 100) : 0;
  return [
    nombreCorto(opciones.tienda),
    `Meta:${dinero(opciones.meta)}`,
    `Mínimo:${dinero(minimo)}`,
    `Venta:${dinero(opciones.venta)}`,
    `Alcance:${alcance}`,
    `TC:${tc}%`
  ].join("\n");
}
