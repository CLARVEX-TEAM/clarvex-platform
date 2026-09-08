/**
 * Cuándo hay que volver a preguntar si existe una versión nueva de la app.
 *
 * ⚠️ **El aviso miraba UNA sola vez por documento y nunca más.** El efecto de
 * `ActualizacionApp` tenía las dependencias vacías y vive en el layout raíz,
 * que en una navegación de cliente NO se vuelve a montar. Así que la respuesta
 * de la primera mirada quedaba congelada para toda la vida de la app: quien
 * abría con la versión al día no se enteraba de ninguna publicación posterior
 * hasta cerrar la app del todo --deslizarla de recientes-- y volver a abrirla.
 * Pasó de verdad el 7 de septiembre de 2026: se publicó la 1.3 con la app ya
 * abierta y no la ofreció a nadie.
 *
 * ⚠️ **Y un 401 la mataba del todo.** `/api/app/version` exige sesión, pero el
 * layout raíz también monta en `/login`, donde todavía no la hay. La respuesta
 * era 401, el efecto salía sin dejar rastro, y como el login navega con
 * `router.replace` --navegación de cliente-- el layout no se remonta y no se
 * volvía a intentar. Es EL MISMO fallo que tuvo `PwaRegister`, en el mismo
 * archivo de layout y por el mismo motivo; se arregló allí y no aquí.
 */

/**
 * Cada cuánto se vuelve a preguntar cuando ya hubo una respuesta buena.
 *
 * ⚠️ **Media hora, y no en cada navegación.** La app se abre y se cierra
 * decenas de veces por turno; preguntar en cada pantalla sería una petición
 * firmada por cada toque, y lo que se gana es enterarse media hora antes de una
 * actualización que sale cada varios meses. Tampoco por temporizador: se mira
 * al VOLVER a la app, que es cuando la persona puede hacer algo al respecto.
 */
export const RECHEQUEO_MS = 30 * 60_000;

export type EstadoMirada = {
  /** No hay respuesta definitiva todavía: falta la sesión, o falló la red. */
  pendiente: boolean;
  /** Hay una descarga en marcha. */
  descargando: boolean;
  /** Cuándo se obtuvo la última respuesta buena. */
  ultimaMirada: number;
  ahora: number;
  /**
   * Hay un motivo concreto para preguntar ahora mismo: se acaba de conceder el
   * permiso de instalar y hace falta un enlace nuevo.
   */
  forzar?: boolean;
};

export function hayQueMirar({ pendiente, descargando, ultimaMirada, ahora, forzar = false }: EstadoMirada): boolean {
  // ⚠️ Nunca a media descarga, ni forzando: la respuesta reescribiría el estado
  // de la tarjeta y la barra de progreso desaparecería con el archivo a medias.
  // Va lo PRIMERO justamente para que `forzar` no pueda saltárselo.
  if (descargando) return false;
  if (forzar) return true;
  // Sin respuesta definitiva se insiste siempre que haya ocasión. Es el caso
  // del 401 en `/login`: la sesión aparece un instante después.
  if (pendiente) return true;
  return ahora - ultimaMirada >= RECHEQUEO_MS;
}

/**
 * Si la respuesta del servidor cierra el asunto o hay que volver a intentarlo.
 *
 * ⚠️ **401 no es «no hay actualización», es «todavía no sé».** Confundirlos es
 * exactamente lo que dejaba la comprobación muerta al arrancar en el login.
 * Cualquier otro rechazo sí es definitivo: repetir un 500 en cada pantalla no
 * lo va a convertir en un 200.
 */
export function siguePendiente(estado: number): boolean {
  return estado === 401;
}

/**
 * La dirección que se le pasa al descargador nativo.
 *
 * ⚠️ **Tiene que ser ABSOLUTA.** El manifiesto entrega una ruta relativa
 * --`/api/app/apk?t=…`-- porque es lo natural dentro de la web, pero quien
 * descarga no es el WebView: es código Java que hace `new URL(url)`, y eso con
 * una ruta sin esquema lanza `MalformedURLException: no protocol`. El mensaje
 * sale en rojo dentro de la tarjeta, con el token entero a la vista, y no dice
 * nada de lo que de verdad pasa.
 *
 * Pasó con la primera actualización real, la 1.3 del 7 de septiembre de 2026:
 * el mecanismo se había escrito entero y nunca se había ejecutado de punta a
 * punta contra un teléfono.
 *
 * ⚠️ **Se resuelve AQUÍ y no en el servidor** a propósito. El plugin ya viaja
 * dentro de los APK repartidos y no se puede cambiar sin repartir otro; la web
 * sí se despliega. Y el origen del WebView es de donde se cargó la app, que es
 * exactamente el servidor que firmó el token — el servidor tendría que deducir
 * su propia dirección pública de una variable de entorno.
 *
 * Una dirección que ya venga absoluta se devuelve intacta, así que si algún día
 * el servidor las manda enteras esto no estorba.
 */
export function urlAbsolutaDeDescarga(url: string, origen: string): string {
  return new URL(url, origen).toString();
}
