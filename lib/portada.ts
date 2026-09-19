/**
 * A qué portada entra cada quien.
 *
 * ⚠️ **Existe porque arreglar los ORÍGENES no bastó.** El 18 de septiembre se
 * corrigió que la app arrancara en la portada web, y se hizo en la raíz y en los
 * botones de volver. Pero hay más de veinte sitios que mandan a `/manager`, y el
 * login era uno de ellos: quien entraba con su PIN dentro de la APK seguía
 * cayendo en la pantalla de la web. Se reportó otra vez el mismo día.
 *
 * La regla vive aquí, y la guarda va también en el DESTINO --ver `/manager` y
 * `/advisor`--, para que la próxima pantalla que escriba `router.replace` no
 * vuelva a abrir el mismo agujero.
 */

export type QuienEntra = {
  role: string;
  /** El celular de la tienda: solo checklist. */
  checklistOnly?: boolean;
};

/**
 * @param enApp `enContenedorNativo()`. Se pasa en vez de leerse aquí para que
 *   esta decisión se pueda probar sin navegador, que es lo que la hizo falible.
 */
export function portadaDe(quien: QuienEntra, enApp: boolean): string {
  /*
   * ⚠️ El kiosko primero, y ANTES de mirar si es la app. Está dado de alta con
   * rol `ASESOR`, así que cualquier reparto por puesto se lo lleva a la portada
   * de asesor. El middleware ya lo manda a `/checklist`; decirlo también aquí
   * evita un salto visible de una pantalla a otra.
   */
  if (quien.checklistOnly) return "/checklist";
  if (enApp) return "/mi-dia";
  return quien.role === "ASESOR" ? "/advisor" : "/manager";
}

/**
 * Si esta portada web hay que abandonarla porque estamos dentro de la APK.
 *
 * Es la guarda del destino: la usan `/manager` y `/advisor` al montar, de modo
 * que da igual por dónde se haya llegado.
 */
export function debeIrAMiDia(quien: QuienEntra, enApp: boolean): boolean {
  return portadaDe(quien, enApp) === "/mi-dia";
}

/** Dónde vive la verificación pública de una credencial: `/v/<token>`. */
export const RUTA_VERIFICACION = "/v";

/**
 * Si esta pantalla la abre alguien de FUERA del equipo.
 *
 * ⚠️ **Es la única pantalla de la app sin sesión que habla de personas**, y la
 * abre un desconocido con una cámara: seguridad del centro comercial o
 * supervisión de AXO comprobando una credencial. Por eso no lleva nada del
 * envoltorio de la app --ni intro, ni barra inferior, ni compuertas--: lo único
 * que esa persona necesita es saber, de un vistazo, si quien tiene delante
 * trabaja aquí.
 *
 * Vive aquí, junto al resto de decisiones de «a dónde va quién», para que el
 * próximo componente global que alguien monte en el layout raíz tenga dónde
 * mirar antes de taparla.
 */
export function esVerificacionPublica(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === RUTA_VERIFICACION || pathname.startsWith(`${RUTA_VERIFICACION}/`);
}
