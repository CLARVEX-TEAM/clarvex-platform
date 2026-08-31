/**
 * Espera larga del chat, del lado del navegador.
 *
 * Pregunta al servidor si hay algo nuevo y **se queda esperando** la respuesta
 * en vez de volver a preguntar cada pocos segundos. En cuanto alguien escribe,
 * el servidor contesta y la pantalla se refresca.
 *
 * Vive aparte de la pantalla para poder probarlo: la lógica delicada no es
 * pedir, es saber cuándo NO hay que volver a intentarlo.
 */

/** Qué hacer después de una vuelta de espera. */
export type Siguiente =
  | { accion: "refrescar"; hasta: string }
  | { accion: "reintentar" }
  | { accion: "parar"; motivo: string };

/**
 * Interpreta una respuesta del endpoint de espera.
 *
 * ⚠️ **Un fallo de RED no es lo mismo que un «no».** Perder una petición por
 * señal intermitente o por volver de segundo plano es lo NORMAL en el teléfono
 * de una tienda, y tiene que reintentarse. Lo que no debe reintentarse es que
 * el servidor conteste que no tienes acceso: ahí insistir es machacar la base
 * cada pocos milisegundos para siempre.
 *
 * Es la misma distinción que ya costó meses con `getSession()`: confundir «no
 * pude preguntar» con «me dijeron que no».
 */
export function interpretar(res: { ok: boolean; status: number }, cuerpo: unknown): Siguiente {
  if (res.ok) {
    const datos = cuerpo as { hay?: boolean; hasta?: string } | null;
    if (datos?.hay && datos.hasta) return { accion: "refrescar", hasta: datos.hasta };
    // Se agotó el plazo sin novedad: es lo esperado, se vuelve a preguntar.
    return { accion: "reintentar" };
  }

  // 401/403: el servidor CONTESTÓ que no. Insistir no lo va a cambiar.
  if (res.status === 401 || res.status === 403) {
    return { accion: "parar", motivo: "Ya no tienes acceso a esta conversación." };
  }
  // 400: la petición está mal armada. Es un fallo nuestro y reintentar lo
  // repetiría igual de mal.
  if (res.status === 400) {
    return { accion: "parar", motivo: "Petición inválida." };
  }
  // El resto (500, 502, corte del proxy) sí puede ser pasajero.
  return { accion: "reintentar" };
}

/**
 * Cuánto esperar antes de volver a intentar tras un fallo.
 *
 * Sube con cada fallo seguido hasta 30 s. Sin freno, un servidor caído recibe
 * una petición por milisegundo de cada teléfono de la tienda justo cuando menos
 * puede con ellas.
 */
export function esperaTrasFallo(fallosSeguidos: number): number {
  const base = 1000 * 2 ** Math.min(fallosSeguidos, 5);
  return Math.min(base, 30_000);
}
