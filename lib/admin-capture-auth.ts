import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Autoriza la CAPTURA de datos operativos desde el panel externo (Retool).
 *
 * Tiene un secreto propio y NO reutiliza `ADMIN_SYNC_SECRET`. Ese solo permite
 * disparar la sincronización de una fuente ya configurada: si se filtra, lo
 * peor que consigue alguien es releer un Excel. Este, en cambio, escribe
 * horarios, y más adelante ventas y asistencia — o sea, la operación de la
 * tienda. Separarlos mantiene el criterio que ya sigue el resto del proyecto:
 * un secreto por capacidad, y el radio de daño acotado a esa capacidad.
 *
 * Sin `ADMIN_CAPTURE_SECRET` configurado responde 401 a todo. Es deliberado:
 * una instalación que no lo tenga no debe quedarse con un endpoint de escritura
 * abierto por olvido.
 */
export function requireAdminCapture(request: Request): NextResponse | null {
  const secret = process.env.ADMIN_CAPTURE_SECRET?.trim();
  // Se recorta el header antes de comparar. La comparación es byte a byte, así
  // que un salto de línea o un espacio colado al pegar el token en el panel
  // externo devolvía 401 sin ninguna pista de por qué — y el espacio sobrante
  // no es material secreto, así que tolerarlo no debilita nada.
  const header = (request.headers.get("authorization") ?? "").trim();
  if (!secret || secret.length < 32 || !safeEquals(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "No autorizado.", diagnostico: describeHeader(header, secret) }, { status: 401 });
  }
  return null;
}

/**
 * ⚠️ TEMPORAL — quitar cuando la captura desde Retool quede confirmada.
 *
 * Un 401 a secas no distingue entre "no llegó cabecera", "llegó sin Bearer" y
 * "llegó un token distinto", y esa ambigüedad ya costó una sesión entera de
 * depuración a ciegas. Describe la FORMA de lo recibido, nunca su contenido:
 * ni el token entrante ni el esperado salen de aquí.
 */
function describeHeader(header: string, secret: string | undefined) {
  const prefix = "Bearer ";
  const startsWithBearer = header.startsWith(prefix);
  const received = startsWithBearer ? header.slice(prefix.length) : "";

  // Localiza el carácter sobrante comparando contra el secreto SIN revelarlo:
  // solo sale de aquí la posición y el código del intruso.
  let sobraAlPrincipio = false;
  let sobraAlFinal = false;
  let codigoCaracterSobrante: number | null = null;
  if (secret && received.length === secret.length + 1) {
    if (received.slice(1) === secret) {
      sobraAlPrincipio = true;
      codigoCaracterSobrante = received.charCodeAt(0);
    } else if (received.slice(0, -1) === secret) {
      sobraAlFinal = true;
      codigoCaracterSobrante = received.charCodeAt(received.length - 1);
    }
  }

  return {
    cabeceraPresente: header.length > 0,
    longitudCabecera: header.length,
    empiezaConBearer: startsWithBearer,
    longitudTokenRecibido: received.length,
    longitudTokenEsperado: secret?.length ?? 0,
    secretoConfigurado: Boolean(secret && secret.length >= 32),
    sobraAlPrincipio,
    sobraAlFinal,
    codigoCaracterSobrante,
    // Si ninguna de las dos anteriores es true y las longitudes difieren en uno,
    // el token no es el nuestro: no basta con quitarle un carácter.
    esOtroToken: Boolean(secret) && received.length !== secret!.length && !sobraAlPrincipio && !sobraAlFinal
  };
}

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
