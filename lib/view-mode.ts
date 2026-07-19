// Decide si gerencia debe ver la versión de ESCRITORIO.
//
// El reto: distinguir un POS de tienda (computadora, a veces con el navegador con
// zoom → innerWidth < umbral) de un teléfono. NO basta con screen.width: varios
// Android lo reportan inflado a píxeles físicos (p. ej. 1080), lo que hacía que un
// teléfono se tomara por computadora y quedara atrapado en la versión de escritorio.
//
// Señal fiable de "computadora": un puntero fino (mouse/trackpad). Un teléfono es
// táctil y nunca lo tiene, así que jamás acaba en escritorio. screen.width solo se
// considera cuando además hay mouse (para el POS con zoom). La preferencia manual
// por dispositivo gana sobre la detección, pero "desktop" tampoco fuerza escritorio
// en un equipo sin pantalla ni mouse capaces (un teléfono con la preferencia vieja).

export const DESKTOP_MIN_WIDTH = 1024;
const PREF_KEY = "clarvex-view";

export type ViewPreference = "desktop" | "mobile" | "auto";

export function getViewPreference(): ViewPreference {
  if (typeof window === "undefined") return "auto";
  const value = window.localStorage.getItem(PREF_KEY);
  return value === "desktop" || value === "mobile" ? value : "auto";
}

export function setViewPreference(mode: ViewPreference) {
  if (typeof window === "undefined") return;
  if (mode === "auto") window.localStorage.removeItem(PREF_KEY);
  else window.localStorage.setItem(PREF_KEY, mode);
}

/** ¿Esta pantalla debe usar la versión de escritorio? (para gerencia) */
export function prefersDesktop(): boolean {
  if (typeof window === "undefined") return false;
  const pref = getViewPreference();
  if (pref === "mobile") return false;

  // Ancho del viewport en px CSS: fiable en todos lados (a diferencia de
  // screen.width). Un teléfono en vertical siempre queda por debajo del umbral.
  const wideViewport = (window.innerWidth || 0) >= DESKTOP_MIN_WIDTH;
  // ¿Puntero fino (mouse/trackpad)? Distingue un POS de un teléfono táctil.
  const hasMouse = typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: fine)").matches;
  // screen.width solo cuenta si hay mouse (en móvil viene inflado y engañaba).
  const bigScreenWithMouse = hasMouse && (window.screen?.width || 0) >= DESKTOP_MIN_WIDTH;

  // "desktop" manual: solo si el equipo realmente puede (viewport ancho o mouse).
  // En un teléfono con la preferencia vieja guardada, esto lo mantiene en móvil.
  if (pref === "desktop") return wideViewport || hasMouse;
  // Auto: viewport ancho, o un equipo con mouse y pantalla física grande (POS con zoom).
  return wideViewport || bigScreenWithMouse;
}
