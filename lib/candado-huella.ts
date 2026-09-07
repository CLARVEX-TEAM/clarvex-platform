/**
 * La preferencia del candado de huella, y cuándo hay que volver a pedirlo.
 *
 * ⚠️ **Es una preferencia del APARATO, no de la cuenta.** Se guarda en el
 * teléfono y no en el servidor: la misma persona puede entrar desde el celular
 * de la tienda y desde el suyo, y querer el candado solo en uno. Guardarlo en la
 * cuenta se lo impondría a los dos.
 */

const CLAVE = "clarvex-candado-huella";

/**
 * ⚠️ `localStorage` LANZA cuando está restringido, no devuelve `null`. Ya se
 * llevó por delante un aviso entero en este proyecto; aquí se llevaría el
 * candado, y en la dirección insegura: quedaría abierto sin decirlo.
 */
export function candadoActivado(): boolean {
  try {
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

export function guardarCandado(activado: boolean): void {
  try {
    if (activado) localStorage.setItem(CLAVE, "1");
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento no se puede recordar la preferencia. No se rompe nada;
    // simplemente hay que volver a activarlo.
  }
}

/**
 * Cuánto puede estar la app en segundo plano antes de volver a pedir la huella.
 *
 * ⚠️ **60 segundos, y NO cero.** Bloquear al instante suena más seguro y es
 * inservible aquí: tomar una foto de evidencia o de un marbete SALE de la app
 * --se abre la cámara del sistema-- así que al volver pediría la huella cada
 * vez. La gente acabaría desactivándolo, y un candado desactivado protege menos
 * que uno con un minuto de gracia.
 */
export const GRACIA_MS = 60_000;

export function hayQueVolverAPedir(salioEn: number | null, ahora = Date.now()): boolean {
  // Nunca se fue a segundo plano: no hay nada que revalidar.
  if (salioEn === null) return false;
  return ahora - salioEn > GRACIA_MS;
}
