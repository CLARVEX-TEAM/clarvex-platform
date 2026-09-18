/**
 * Cuándo se dice «sin conexión» y cuándo se deja de decir.
 *
 * Está aparte del componente porque el fallo que arregla no se ve: la franja
 * roja se quedaba puesta con la conexión ya recuperada, y desde fuera eso es
 * indistinguible de no tener red.
 *
 * ⚠️ **En Android el evento `online` del WebView NO siempre llega.** Reportado
 * en tienda el 18 de septiembre de 2026: la cola se vació sola --o sea que había
 * conexión de sobra-- y la franja siguió diciendo «Sin conexión». La cola se
 * vacía con `visibilitychange`, que sí llega siempre; la franja dependía del
 * evento que no llega.
 *
 * ⚠️ **Una entrega manda sobre cualquier bandera.** Si el servidor acaba de
 * contestar, hay conexión: eso es un hecho, y `navigator.onLine` es una opinión
 * del sistema. Al revés no vale --que no haya entregas no demuestra nada, porque
 * lo normal es que no haya nada que mandar.
 */

export type SenalDeConexion =
  /** El navegador avisó de que se cayó. */
  | { tipo: "evento-offline" }
  /** El navegador avisó de que volvió. Puede no llegar nunca en Android. */
  | { tipo: "evento-online" }
  /** Se miró `navigator.onLine`: al montar y al volver a la app. */
  | { tipo: "mirada"; enLinea: boolean }
  /** Una operación de la cola llegó al servidor. */
  | { tipo: "entrega" };

export type EstadoDeConexion = {
  sinConexion: boolean;
  /** `true` solo en el instante en que se recupera, para el aviso verde. */
  recupero: boolean;
};

export function siguienteConexion(sinConexion: boolean, senal: SenalDeConexion): EstadoDeConexion {
  switch (senal.tipo) {
    case "evento-offline":
      return { sinConexion: true, recupero: false };

    case "evento-online":
      return { sinConexion: false, recupero: sinConexion };

    case "mirada":
      return { sinConexion: !senal.enLinea, recupero: sinConexion && senal.enLinea };

    case "entrega":
      /*
       * El servidor contestó, así que hay conexión pase lo que pase. Es la
       * salida que rescata el caso de Android, donde `evento-online` puede no
       * llegar jamás.
       */
      return { sinConexion: false, recupero: sinConexion };
  }
}
