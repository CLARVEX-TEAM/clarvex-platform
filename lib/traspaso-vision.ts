import { z } from "zod";
import { bedrockConfigured, readWithBedrock } from "@/lib/pos-vision-bedrock";
import { enQueDifieren, type Direccion, type HojaTraspaso } from "@/lib/traspaso-hoja";

/**
 * Lee la hoja de traspaso del corporativo de una foto.
 *
 * ⚠️ **Se lee DOS VECES, con dos modelos distintos, y tienen que coincidir.**
 *
 * La hoja no trae con qué comprobarse: solo llega la primera página, y sus
 * renglones no suman el total --23 de 48 en el traspaso 1767557--. A diferencia
 * del reporte del POS, aquí no hay una cuenta que cierre.
 *
 * La segunda lectura es la comprobación, y no es una ocurrencia: medido el 9 de
 * septiembre de 2026 contra cinco reportes reales, Haiku y Sonnet fallaron **una
 * vez cada uno y en sitios distintos**. Sus erratas son independientes, así que
 * coincidir en el mismo número equivocado es mucho menos probable que
 * equivocarse.
 *
 * ⚠️ **Repetir con el MISMO modelo no valdría.** La temperatura es 0: la segunda
 * pasada devolvería lo mismo, errata incluida, y el candado seria puro teatro.
 */

const RAPIDO = process.env.BEDROCK_POS_MODEL ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const SEGUNDO = process.env.BEDROCK_TRASPASO_MODEL ?? "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

const PROMPT = `Lee esta hoja de traspaso de mercancía y devuelve SOLO un JSON.

{
  "folio": "el número que sigue a «Transferir:», arriba a la izquierda",
  "direccion": "SALIDA si dice «Transferencia de salidas», ENTRADA si dice «de entradas»",
  "origen": "el código de «Ubicación de envío», solo los dígitos",
  "destino": "el código de «Ubicación de recepción», solo los dígitos",
  "piezas": 0,
  "fecha": "AAAA-MM-DD",
  "renglones": [0]
}

REGLAS QUE NO PUEDES ROMPER:

1. "piezas" es «Total unidades enviadas», del ENCABEZADO. NO sumes los renglones
   de la tabla: la hoja sigue en la página siguiente y esa suma da de menos.

2. LEE «Total unidades enviadas» Y EL FOLIO DÍGITO A DÍGITO. Son los dos números
   que se guardan, y esta hoja no tiene ninguna cuenta con la que comprobarlos
   después. 48 leído como 43 se convierte en piezas que nunca salieron del
   inventario, y no se nota hasta el conteo físico.

3. "origen" y "destino" son los CÓDIGOS, no los nombres. De «Ubicación de envío:
   03029 - TOMMY HILFIGER» se devuelve "03029". De «Ubicación de recepción:
   03000 - TOMMY» se devuelve "03000". Conserva los ceros de delante.

4. "fecha" es la que aparece arriba a la derecha, junto a la hora. Si la hoja
   trae escrita a mano una «Fecha en que se despachó», usa ESA en su lugar.

5. "renglones" son las cantidades de la columna «Unidades enviadas» de la tabla,
   una por talla, SOLO las que se alcanzan a ver en esta página. Si no se ve
   ninguna, devuelve una lista vacía.

6. NO INVENTES. Si un dato no se ve, pon null. Nunca deduzcas un total a partir
   de los renglones ni un código a partir del nombre de la tienda.

No escribas nada fuera del JSON.`;

const esquema = z.object({
  folio: z.union([z.string(), z.number()]).nullable(),
  direccion: z.string().nullable(),
  origen: z.union([z.string(), z.number()]).nullable(),
  destino: z.union([z.string(), z.number()]).nullable(),
  piezas: z.number().nullable(),
  fecha: z.string().nullable(),
  renglones: z.array(z.number()).nullable().optional()
});

/** Los códigos llegan a veces como número y pierden el cero de delante. */
function codigo(valor: string | number | null): string | null {
  if (valor === null) return null;
  const texto = String(valor).trim().replace(/\D/g, "");
  if (!texto) return null;
  // El catálogo usa cinco dígitos («03029»). Un `3029` leído como número es el
  // mismo sitio y no puede rechazarse por el formato.
  return texto.length === 4 ? `0${texto}` : texto;
}

function aHoja(crudo: unknown): HojaTraspaso | { problema: string } {
  const parsed = esquema.safeParse(crudo);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { problema: `${issue?.path.join(".") || "la respuesta"}: ${issue?.message ?? "no encaja"}` };
  }
  const d = parsed.data;
  const direccion = (d.direccion ?? "").trim().toUpperCase();
  if (direccion !== "SALIDA" && direccion !== "ENTRADA") {
    return { problema: "no se leyó si la hoja es de entrada o de salida" };
  }
  if (d.piezas === null || d.folio === null) {
    return { problema: "no se leyeron el folio o el total de unidades" };
  }
  return {
    folio: String(d.folio).trim().replace(/\D/g, ""),
    direccion: direccion as Direccion,
    origen: codigo(d.origen),
    destino: codigo(d.destino),
    piezas: d.piezas,
    fechaImpresa: (d.fecha ?? "").trim() || null,
    renglones: (d.renglones ?? []).filter((n) => Number.isFinite(n))
  };
}

async function unaLectura(
  dataBase64: string,
  mimeType: string,
  modelo: string
): Promise<HojaTraspaso | { problema: string }> {
  const salida = await readWithBedrock(PROMPT, dataBase64, mimeType, 25_000, modelo);
  if (!salida.ok) return { problema: salida.problem };
  try {
    return aHoja(JSON.parse(salida.text));
  } catch {
    return { problema: "la respuesta no vino en el formato esperado" };
  }
}

export type LecturaTraspaso =
  | { ok: true; hoja: HojaTraspaso; confirmadaPorDos: boolean }
  | { ok: false; problema: string; detalle?: string[] };

export function traspasoConfigurado(): boolean {
  return bedrockConfigured();
}

/**
 * Lee la hoja con los dos modelos, **en paralelo**, y compara.
 *
 * ⚠️ En paralelo y no uno tras otro: en serie serían unos trece segundos con la
 * persona esperando en Telegram, y el segundo no depende del primero.
 *
 * Si el segundo modelo no contesta --saturado, caído-- NO se da por bueno el
 * primero en silencio: se dice que la lectura quedó sin confirmar, y quien
 * captura decide. Callarlo convertiría la única comprobación que hay en algo
 * que a veces existe y a veces no, sin forma de saber cuál fue.
 */
export async function leerHojaTraspaso(dataBase64: string, mimeType: string): Promise<LecturaTraspaso> {
  const [primera, segunda] = await Promise.all([
    unaLectura(dataBase64, mimeType, RAPIDO),
    unaLectura(dataBase64, mimeType, SEGUNDO)
  ]);

  if ("problema" in primera) {
    return { ok: false, problema: `No se pudo leer la hoja: ${primera.problema}.` };
  }
  if ("problema" in segunda) {
    return { ok: true, hoja: primera, confirmadaPorDos: false };
  }

  const diferencias = enQueDifieren(primera, segunda);
  if (diferencias.length > 0) {
    return {
      ok: false,
      problema: "Las dos lecturas de la hoja no coinciden, así que alguna leyó mal un número.",
      detalle: diferencias
    };
  }
  return { ok: true, hoja: primera, confirmadaPorDos: true };
}
