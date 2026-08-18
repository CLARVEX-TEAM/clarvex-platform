/**
 * Cuánto le come el teclado en pantalla a la ventana.
 *
 * `interactive-widget=resizes-content` ya está en el viewport de la app, pero
 * eso SOLO lo respeta Chrome en Android. En iOS Safari —donde corre la PWA en
 * iPhone— el teclado no encoge el viewport de layout: se monta ENCIMA. Como el
 * modal de captura es `position: fixed` anclado abajo, su borde inferior queda
 * detrás del teclado y con él el botón de guardar.
 *
 * Y no hay salida por el teclado: el teclado NUMÉRICO no trae tecla Enter en
 * ningún teléfono, así que `enterKeyHint` no pinta nada y el botón es la única
 * forma de guardar. Tiene que estar visible.
 */

/** Umbral en píxeles para no confundir redondeos del navegador con un teclado. */
const NOISE_PX = 24;

/**
 * Píxeles tapados por el teclado. Se separa de React para poder probarlo.
 *
 * En iOS el viewport visual además se DESPLAZA hacia arriba, así que no basta
 * con la diferencia de alturas: hay que descontar también ese desplazamiento.
 */
export function keyboardInsetFrom(windowHeight: number, viewportHeight: number, offsetTop: number): number {
  const covered = windowHeight - viewportHeight - offsetTop;
  if (!Number.isFinite(covered) || covered <= NOISE_PX) return 0;
  return Math.round(covered);
}
