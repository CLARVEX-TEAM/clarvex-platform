/**
 * El RITMO esperado de la venta a una hora del día: qué parte de la meta
 * debería llevar la tienda a esa hora. Es lo que permite que el panel en vivo
 * diga «vas arriba» a las 2 de la tarde con un 30 %, en vez de pintarlo rojo
 * contra el 100 % del día.
 *
 * ⚠️ **Es una ESTIMACIÓN, no un dato.** La curva reparte el día de centro
 * comercial: poco al abrir, más en la tarde, el pico de 5 a 8. Todavía no hay
 * venta por hora capturada para calibrarla con la tienda. El panel la nombra
 * como «ritmo estimado» por eso.
 */

/** Horario de piso: de 11:00 a 21:00, como el turno estándar de la tienda. */
export const APERTURA_MIN = 11 * 60;
export const CIERRE_MIN = 21 * 60;

/** Peso de cada hora de 11 a 21 (suman 100). */
const PESOS = [5, 7, 8, 9, 9, 10, 11, 13, 13, 10, 5];

/** Fracción 0..1 de la meta que se espera a `minutos` (minutos del día, hora de Monterrey). */
export function ritmoEsperado(minutos: number): number {
  if (minutos <= APERTURA_MIN) return 0;
  if (minutos >= CIERRE_MIN) return 1;
  const transcurrido = minutos - APERTURA_MIN;
  const hora = Math.floor(transcurrido / 60);
  const dentro = (transcurrido % 60) / 60;
  const antes = PESOS.slice(0, hora).reduce((t, p) => t + p, 0);
  return (antes + PESOS[hora] * dentro) / 100;
}

/** Cuánto va la venta contra el ritmo: positivo = arriba. */
export function contraElRitmo(venta: number, meta: number, minutos: number): number | null {
  if (meta <= 0) return null;
  return Math.round((venta - meta * ritmoEsperado(minutos)) * 100) / 100;
}
