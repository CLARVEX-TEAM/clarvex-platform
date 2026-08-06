/**
 * ¿Los datos del RDV siguen avanzando?
 *
 * `sync-alert` ya vigila que la sincronización CORRA y no falle, pero eso no
 * basta: si el archivo de origen deja de actualizarse —porque el flujo que lo
 * copia se rompió, o porque nadie captura— la sincronización sigue saliendo
 * verde todos los días mientras importa una y otra vez el mismo archivo viejo.
 * Los KPIs se congelan sin que nada avise.
 *
 * Es el modo de fallo del RDV de GUESS, que llega por un Power Automate alojado
 * en el tenant de otra empresa: si ese flujo se detiene, no tenemos ni acceso
 * para enterarnos. Esta comprobación es la única alarma.
 */

/**
 * Días completos entre el último día CON VENTA y hoy.
 *
 * `null` cuando todavía no hay ningún día con venta: eso no es un dato
 * congelado sino una fuente que nunca ha traído nada, y de eso ya avisa la
 * rama de "nunca se ha sincronizado con éxito".
 */
export function daysSinceLatestSale(today: Date, latestSaleDate: Date | null): number | null {
  if (!latestSaleDate) return null;
  const days = Math.floor((today.getTime() - latestSaleDate.getTime()) / 86_400_000);
  // Una fecha futura no adelanta el reloj: se trata como "hoy". Un dedazo al
  // capturar (venta cargada en un día que aún no ocurre) dejaría la fuente
  // pareciendo fresca para siempre justo cuando más falta hace detectarlo.
  return days < 0 ? 0 : days;
}

/**
 * Margen antes de dar la voz de alarma.
 *
 * Dos días deja pasar el hueco normal —la tienda captura el día siguiente, y la
 * sincronización puede correr antes de que lo haga— sin tragarse una avería:
 * al tercer día sin ventas nuevas ya no hay explicación inocente.
 */
export const STALE_DATA_DAYS = 2;

/** true si el RDV lleva demasiado sin traer un día nuevo con venta. */
export function isDataFrozen(today: Date, latestSaleDate: Date | null): boolean {
  const days = daysSinceLatestSale(today, latestSaleDate);
  return days !== null && days > STALE_DATA_DAYS;
}
