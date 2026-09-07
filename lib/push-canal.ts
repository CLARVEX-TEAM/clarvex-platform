/**
 * El identificador del canal de notificaciones de Android.
 *
 * ⚠️ **Vive aquí solo, y lo importan los dos lados**: quien crea el canal
 * (`lib/puente-nativo.ts`, desde el navegador de la app) y quien manda los
 * mensajes (`lib/push-fcm.ts`, desde el servidor). Estaba escrito a mano en los
 * dos y no podía quedarse así: si divergen NO falla nada --los avisos caen en
 * el canal de reserva que crea Firebase, con importancia media, y entran
 * mudos--, así que el síntoma sería «no suenan las notificaciones» y la causa
 * estaría en una cadena copiada.
 *
 * ⚠️ **Queda una cuarta copia fuera de este repositorio**: el
 * `default_notification_channel_id` del AndroidManifest de `clarvex-movil`. Esa
 * no se puede importar --es otro repositorio y es XML-- así que va comentada
 * allí señalando aquí. Cambiar este valor obliga a cambiar aquel.
 */
export const CANAL_AVISOS_ID = "clarvex-avisos";
