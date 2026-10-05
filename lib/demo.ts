// Modo DEMO público: una tienda ficticia y aislada (`demo-showcase`) que los
// visitantes del sitio pueden explorar como Gerente o como Asesor, SIN PIN y en
// SOLO LECTURA (el middleware bloquea todo método que no sea GET para sesiones
// demo). Nunca toca datos de tiendas reales.

export const DEMO_STORE_ID = "demo-showcase";

/** Números de empleado de los dos usuarios por los que se entra al demo. */
export const DEMO_MANAGER_EMPLOYEE = "DEMO-100";
export const DEMO_ADVISOR_EMPLOYEE = "DEMO-201";

/**
 * Pista de cliente, NO una credencial.
 *
 * ⚠️ El candado del escritorio pide número de empleado y PIN, y quien entra al
 * demo no tiene ninguno de los dos: el escritorio era un callejón sin salida
 * para cualquier visitante con computadora. Se descubrió el 4 de octubre de
 * 2026 preparando el sitio público.
 *
 * ⚠️ **Y NO se puede resolver pidiendo la sesión siempre.** El candado se pinta
 * sin tocar la red a propósito --si no, la computadora de la tienda enseñaría
 * «Cargando escritorio…» en cada pestaña nueva--. Esta cookie es solo la señal
 * barata de «vale la pena preguntar»; se lee sin red y no concede nada.
 *
 * ⚠️ **Quien decide es el SERVIDOR**, no esta cookie: el escritorio solo se abre
 * si `/api/auth/session` confirma `demo: true`. Falsificarla no abre nada --lo
 * peor que consigue es una petición de más-- y el candado nunca fue una frontera
 * de seguridad: `sessionStorage.desktop_unlocked` ya lo saltaba. Lo que de
 * verdad protege los datos es la sesión y el corte de escrituras del middleware.
 *
 * Sin `httpOnly` a propósito: existe justamente para leerse desde el navegador.
 */
export const DEMO_HINT_COOKIE = "clarvex_demo";

/** ¿Hay pista de sesión demo en este navegador? Solo cliente; no decide nada. */
export function hayPistaDeDemo(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.startsWith(`${DEMO_HINT_COOKIE}=1`));
}
