// Decide si gerencia debe ver la versión de ESCRITORIO.
// Los POS de tienda a veces tienen el navegador con zoom o pantallas chicas, así
// que window.innerWidth se queda por debajo del umbral aunque sea una computadora.
// Por eso se usa también screen.width (resolución física, no afectada por el zoom)
// y una preferencia manual guardada por dispositivo que gana sobre la detección.

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
  if (pref === "desktop") return true;
  if (pref === "mobile") return false;
  const widest = Math.max(window.innerWidth || 0, window.screen?.width || 0);
  return widest >= DESKTOP_MIN_WIDTH;
}
