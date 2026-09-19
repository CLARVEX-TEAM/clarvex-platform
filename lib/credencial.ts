import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Credencial digital: identidad visible, con QR que verifica cualquiera.
 *
 * El QR lleva un enlace firmado. Quien lo escanea --supervisión de AXO, el
 * centro comercial, un proveedor-- abre una página del servidor que dice si esa
 * persona trabaja ahí y hasta cuándo. No hace falta que tenga la app ni sesión:
 * ese es el punto.
 *
 * ⚠️ **Esa página la puede abrir CUALQUIERA con el enlace**, así que enseña lo
 * mínimo: nombre, puesto, tienda y vigencia. Nunca el número de empleado, el
 * correo ni el teléfono. Un QR fotografiado no puede convertirse en una ficha de
 * personal.
 *
 * ⚠️ **Y se comprueba contra la BASE en cada consulta, no solo la firma.** Una
 * baja tiene que dejar de verificar al instante aunque su QR siga impreso en
 * algún lado; si bastara con la firma, el credencial de quien se fue seguiría
 * valiendo hasta caducar.
 *
 * ⚠️ Esto identifica, NO autoriza. No sirve para fichar, aprobar un descuento ni
 * abrir la caja: un código de identidad se fotografía y se reusa. Eso sería un
 * segundo factor y necesita caducidad de segundos y un solo uso.
 */

/** Cuánto vale un enlace de credencial. Se renueva solo al abrir la pantalla. */
export const VIGENCIA_DIAS = 30;

export type DatosCredencial = {
  /** Id del usuario. Lo demás se lee de la base al verificar, nunca del token. */
  u: string;
  /** Tienda, para no verificar contra la tienda equivocada. */
  s: string;
  /** Epoch en segundos. */
  exp: number;
};

/**
 * ⚠️ Llave DERIVADA de `AUTH_SECRET`, no el secreto en crudo.
 *
 * Firmar dos cosas distintas con la misma llave permite que una firma válida
 * para una valga para la otra el día que los formatos se parezcan. La etiqueta
 * las separa para siempre y no cuesta nada.
 */
function llave(): Buffer {
  const secreto = process.env.AUTH_SECRET ?? "";
  if (secreto.length < 32) throw new Error("AUTH_SECRET no está configurado.");
  return createHmac("sha256", secreto).update("clarvex-credencial-v1").digest();
}

function base64url(valor: Buffer | string): string {
  return Buffer.from(valor).toString("base64url");
}

/** Firma el contenido del QR. */
export function firmarCredencial(datos: DatosCredencial): string {
  const cuerpo = base64url(JSON.stringify(datos));
  const firma = base64url(createHmac("sha256", llave()).update(cuerpo).digest());
  return `${cuerpo}.${firma}`;
}

/**
 * Lee un enlace de credencial. `null` si no está firmado por nosotros.
 *
 * ⚠️ La comparación es de tiempo constante. Con un `===` normal, el tiempo que
 * tarda en fallar revela cuántos caracteres del principio acertó, y eso permite
 * construir una firma válida a ciegas.
 */
export function leerCredencial(token: string): DatosCredencial | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [cuerpo, firma] = partes as [string, string];

  let esperada: Buffer;
  let recibida: Buffer;
  try {
    esperada = createHmac("sha256", llave()).update(cuerpo).digest();
    recibida = Buffer.from(firma, "base64url");
  } catch {
    return null;
  }
  if (recibida.length !== esperada.length) return null;
  if (!timingSafeEqual(recibida, esperada)) return null;

  try {
    const datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as DatosCredencial;
    if (typeof datos?.u !== "string" || typeof datos?.s !== "string" || typeof datos?.exp !== "number") return null;
    return datos;
  } catch {
    return null;
  }
}

export type EstadoCredencial = "vigente" | "caducada" | "baja" | "invalida";

/**
 * Qué decir de una credencial.
 *
 * ⚠️ **«Caducada» y «baja» se dicen DISTINTO a propósito.** Un enlace viejo de
 * alguien que sigue trabajando se arregla abriendo la app; alguien que ya no
 * trabaja ahí es otra cosa, y quien verifica necesita distinguirlas.
 */
export function estadoDeCredencial(entrada: {
  datos: DatosCredencial | null;
  activo: boolean;
  mismaTienda: boolean;
  ahora?: Date;
}): EstadoCredencial {
  if (!entrada.datos) return "invalida";
  const ahora = entrada.ahora ?? new Date();
  // La tienda se comprueba: un traslado no puede seguir acreditando en la
  // anterior con un enlace emitido antes.
  if (!entrada.mismaTienda) return "invalida";
  if (!entrada.activo) return "baja";
  if (entrada.datos.exp * 1000 <= ahora.getTime()) return "caducada";
  return "vigente";
}

export function comoSeDice(estado: EstadoCredencial): { texto: string; tono: "bien" | "aviso" | "malo" } {
  switch (estado) {
    case "vigente":
      return { texto: "Credencial vigente", tono: "bien" };
    case "caducada":
      return { texto: "Credencial caducada. Pide que la actualice desde la app.", tono: "aviso" };
    case "baja":
      return { texto: "Esta persona ya no trabaja en esta tienda.", tono: "malo" };
    case "invalida":
      return { texto: "Esta credencial no es válida.", tono: "malo" };
  }
}
