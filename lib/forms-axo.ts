import { createHash } from "node:crypto";
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

/**
 * El botón «Llenar desde Clarvex» del Forms de asistencia de AXO: un script de
 * Tampermonkey (`public/forms-axo.user.js`) que corre DENTRO del Forms, con la
 * sesión de AXO de quien lo llena, y le pide a Clarvex los datos y las fotos
 * de hoy.
 *
 * ⚠️ **Va con un CÓDIGO personal, no con la cookie de Clarvex.** El script vive
 * en otro sitio (forms.cloud.microsoft) y la cookie es SameSite=Lax: en Firefox
 * del celular no hay garantía de que viaje. El código lo pide gerencia al bot
 * de WhatsApp («código forms») y se pega una vez en el script.
 *
 * ⚠️ **El código solo sirve para LEER el paquete de hoy de SU tienda.** Se firma
 * con una llave DERIVADA de AUTH_SECRET y no con la de la sesión, así que no se
 * puede usar como sesión aunque alguien lo intente. Lleva la `sessionVersion`:
 * «cerrar todas las sesiones» lo invalida igual que a las demás.
 *
 * ⚠️ El script NUNCA envía el Forms: llena y se detiene. El Forms es una
 * declaración de la tienda ante AXO y quien pica Enviar es una persona.
 */

/** Cómo se llama cada tienda y su supervisor en las listas del Forms de AXO. */
export const FORMS_AXO: Record<string, { tienda: string; supervisor: string }> = {
  // TH San Agustín. Textos copiados TAL CUAL de las opciones del Forms (8 nov 2026).
  "clarvex-demo-store": { tienda: "TOMMY HILFIGER SAN AGUSTIN MONTERREY.", supervisor: "DANIEL HERNÁNDEZ." }
};

const PROPOSITO = "forms-axo";
const DURACION = "180d";

function llave(): Uint8Array {
  const base = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!base) throw new Error("AUTH_SECRET es obligatorio.");
  return new Uint8Array(createHash("sha256").update(`${base}:${PROPOSITO}`).digest());
}

export async function crearCodigoForms(usuario: { id: string; storeId: string; sessionVersion: number }): Promise<string> {
  return new SignJWT({ storeId: usuario.storeId, sv: usuario.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(usuario.id)
    .setAudience(PROPOSITO)
    .setIssuedAt()
    .setExpirationTime(DURACION)
    .sign(llave());
}

export async function leerCodigoForms(codigo: string): Promise<{ userId: string; storeId: string; sv: number } | null> {
  try {
    const { payload } = await jwtVerify(codigo, llave(), { algorithms: ["HS256"], audience: PROPOSITO });
    if (typeof payload.sub !== "string" || typeof payload.storeId !== "string" || typeof payload.sv !== "number") return null;
    return { userId: payload.sub, storeId: payload.storeId, sv: payload.sv };
  } catch {
    return null;
  }
}

/** ¿Pide su código para el Forms? «código forms», «codigo del forms», «código para el forms». */
export function pideCodigoForms(texto: string | null | undefined): boolean {
  return /^\s*c[oó]digo\s+(?:del\s+|para\s+el\s+|de\s+)?forms?\s*[.!?]*\s*$/i.test(texto ?? "");
}

export const URL_DEL_SCRIPT = "https://team.clarvex.tech/forms-axo.user.js";
