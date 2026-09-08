import { readWithBedrock } from "@/lib/pos-vision-bedrock";
import type { PromoExtraida } from "@/lib/promo-comunicado";

/**
 * Lee una captura del correo de promociones del corporativo.
 *
 * ⚠️ **Su trabajo es TRANSCRIBIR, no redactar.** Lo que devuelve son campos con
 * el texto tal como viene; el comunicado lo arma `redactarComunicado` con una
 * plantilla fija. Si este módulo se pusiera a resumir, una restricción quedaría
 * cambiada y eso se paga en el mostrador.
 *
 * Es el mismo camino que el lector del reporte del POS: Bedrock, una imagen, y
 * nada de lo que devuelve se da por bueno sin comprobarlo.
 */

const PROMPT = `Eres un transcriptor. Recibes la captura de un correo interno de
Axo México con las promociones de la semana para una tienda Tommy Hilfiger.

Devuelve SOLO un objeto JSON con esta forma exacta:

{
  "promocion": "nombre de la promoción tal como aparece",
  "vigencia": "la línea de vigencia completa, tal cual",
  "descuentos": ["cada línea de descuento, literal"],
  "codigo": "el número largo que acompaña a la promoción, o null",
  "noParticipa": ["cada línea de la mercancía que NO participa, literal"],
  "avisos": ["cualquier instrucción u orden que no sea descuento ni exclusión"]
}

REGLAS QUE NO PUEDES ROMPER:

1. COPIA LITERAL. No resumas, no acortes, no corrijas la ortografía, no
   traduzcas y no unifiques mayúsculas. "LICENCIAS (RELOJES Y FRAGANCIAS)" se
   copia entero: si escribes solo "LICENCIAS" estás excluyendo menos mercancía
   de la que el corporativo excluyó.

2. NO INVENTES. Si un dato no aparece en la captura, deja la cadena vacía, la
   lista vacía o null. Nunca deduzcas una vigencia, un porcentaje ni un código.

3. "avisos" es para lo que hay que OBEDECER y no es ni descuento ni exclusión.
   Suele ir subrayado o al final. Ejemplo real: "Recuerden que a partir del día
   de mañana no puede hacerse venta producto del 60% bajo esa promoción".
   Cópialo entero. Perder esta línea es el error más caro que puedes cometer.

4. Los saludos, la firma y los datos del remitente NO son parte de nada.

5. Si la captura no es un correo de promociones, devuelve
   {"promocion":"","vigencia":"","descuentos":[],"codigo":null,"noParticipa":[],"avisos":[]}.

No escribas nada fuera del JSON.`;

/** Deja una lista de textos limpia y acotada, sin inventar nada. */
function listaDeTextos(valor: unknown, tope: number): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x.length <= 400)
    .slice(0, tope);
}

function texto(valor: unknown, tope: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, tope) : "";
}

export type LecturaPromo = { ok: true; promo: PromoExtraida } | { ok: false; problema: string };

export async function leerPromocion(dataBase64: string, mimeType: string): Promise<LecturaPromo> {
  const salida = await readWithBedrock(PROMPT, dataBase64, mimeType);
  if (!salida.ok) return { ok: false, problema: salida.problem };

  let crudo: unknown;
  try {
    crudo = JSON.parse(salida.text);
  } catch {
    // ⚠️ Un JSON que no parsea NO se intenta arreglar a mano. Lo que se
    // recompusiera de una respuesta rota sería una promoción inventada, y aquí
    // eso se convierte en un precio equivocado.
    return { ok: false, problema: "la respuesta no vino en el formato esperado" };
  }
  if (typeof crudo !== "object" || crudo === null) {
    return { ok: false, problema: "la respuesta no vino en el formato esperado" };
  }

  const o = crudo as Record<string, unknown>;
  const codigo = texto(o.codigo, 64);
  return {
    ok: true,
    promo: {
      promocion: texto(o.promocion, 120),
      vigencia: texto(o.vigencia, 200),
      // Los topes son generosos a propósito: recortar una lista de exclusiones
      // dejaría fuera mercancía que sí estaba excluida.
      descuentos: listaDeTextos(o.descuentos, 40),
      codigo: codigo.length > 0 ? codigo : null,
      noParticipa: listaDeTextos(o.noParticipa, 40),
      avisos: listaDeTextos(o.avisos, 20)
    }
  };
}
