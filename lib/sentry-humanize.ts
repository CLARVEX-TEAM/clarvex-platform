/**
 * Traduce los errores del navegador a algo que se pueda leer sin ser programador.
 *
 * El motivo: `AbortError: signal is aborted without reason` no le dice nada a
 * quien abre la alerta. Y como la mayoría de lo que llega desde un celular son
 * cortes de señal, la bandeja se llena de ruido y los fallos de verdad se
 * pierden entre ellos.
 *
 * ⚠️ Se RETITULAN y se bajan de nivel, NO se descartan.
 *
 * Es tentador tirarlos: son de red, no de la app. Pero el 24 de agosto de 2026
 * un `AbortError` fue justamente lo que delató tres componentes globales sin
 * `.catch` —y uno de ellos montaba en todas las pantallas—. Filtrarlos nos
 * habría dejado ciegos ante un bug real. Bajarlos a `warning` los saca del
 * camino sin borrarlos: los errores que quedan en rojo son los que hay que
 * mirar.
 */

/** Cortes de red y cancelaciones. Ocurren a diario en un celular en tienda. */
const NETWORK_PATTERNS: ReadonlyArray<{ match: RegExp; title: string }> = [
  // El nuestro: el timeout de `getSession` / `fetchAppData` cancela la petición.
  { match: /abort(ed|error)|signal is aborted/i, title: "Se agotó el tiempo de espera de la red" },
  // Chrome / Firefox / Safari dicen lo mismo con tres frases distintas.
  { match: /failed to fetch|networkerror|network request failed/i, title: "No se pudo conectar con el servidor" },
  { match: /load failed|the network connection was lost|cancell?ed/i, title: "Se perdió la conexión a media petición" },
  { match: /timeout|timed out/i, title: "El servidor tardó demasiado en responder" }
];

/** Fallos que sí son de la app, pero con un nombre que no se entiende. */
const APP_PATTERNS: ReadonlyArray<{ match: RegExp; title: string }> = [
  // Pasa tras un despliegue: el navegador pide un trozo de código que ya no
  // existe. Se arregla recargando, y por eso conviene reconocerlo de un vistazo.
  {
    match: /chunkloaderror|loading chunk|dynamically imported module|importing a module script failed/i,
    title: "La app quedó con una versión vieja: hace falta recargar"
  },
  { match: /quotaexceeded/i, title: "El almacenamiento del dispositivo está lleno" },
  { match: /is not a function|undefined is not an object|cannot read propert/i, title: "Error de programación en la app" }
];

export type Humanized = { title: string; level: "warning" | "error" };

/**
 * Devuelve el título en claro y el nivel que le toca, o `null` si no se
 * reconoce el mensaje (entonces se deja tal cual: inventar una traducción
 * genérica sería peor que enseñar el texto original).
 */
export function humanizeError(message: string | undefined | null): Humanized | null {
  if (!message) return null;
  for (const { match, title } of NETWORK_PATTERNS) {
    if (match.test(message)) return { title, level: "warning" };
  }
  for (const { match, title } of APP_PATTERNS) {
    if (match.test(message)) return { title, level: "error" };
  }
  return null;
}
