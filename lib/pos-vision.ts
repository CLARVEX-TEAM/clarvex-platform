import { z } from "zod";
import type { PosReport, PosRow } from "@/lib/pos-productivity";

/**
 * Lee el reporte «Productividad del vendedor» desde una captura de pantalla.
 *
 * Va aparte del resto de la IA (`lib/ai/*`) a propósito: aquello es un chat con
 * herramientas, memoria y guardarraíles de conversación. Esto es una sola
 * llamada de un solo uso —imagen entra, tabla sale— y mezclarlas obligaría a
 * tocar el camino del copiloto para nada.
 *
 * ⚠️ **Lo que devuelve el modelo NO se cree.** Se valida la forma con zod y
 * después `posCaptureRows` comprueba las cuatro cuentas internas del reporte.
 * Es lo que hace aceptable leer una foto de la pantalla: si un dígito sale mal,
 * alguna cuenta se rompe y la captura se detiene. Sin esa red, esto sería
 * teclear a ciegas con pasos extra.
 */

/**
 * Modelo por defecto medido contra el reporte real de TH SAN AGUSTIN: leyó las
 * cuatro filas exactas en 11 s. `gemini-2.5-flash` también acierta, pero
 * «piensa» tanto para una transcripción que se pasaba de los 45 s.
 */
const MODEL = process.env.POS_VISION_MODEL ?? "gemini-3.1-flash-lite";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 45_000;

/** Forma OBJECT/ARRAY que entiende Gemini para forzar la estructura. */
const NUMBER = { type: "NUMBER" } as const;
const INTEGER = { type: "INTEGER" } as const;
const STRING = { type: "STRING" } as const;

/**
 * ⚠️ El esquema se manda a Gemini, no solo se valida al volver.
 *
 * Sin él, y con el razonamiento apagado, el modelo devolvía JSON ROTO: se
 * comía la llave de cierre de una fila y fundía dos vendedores en uno. Los
 * números estaban bien; la estructura no. Forzando el esquema, el formato deja
 * de ser cosa del modelo.
 */
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    from: STRING,
    to: STRING,
    storeNumber: STRING,
    rows: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: STRING,
          tickets: INTEGER,
          units: INTEGER,
          unitsReturned: INTEGER,
          gross: NUMBER,
          discount: NUMBER,
          afterDiscount: NUMBER,
          returns: NUMBER,
          net: NUMBER,
          avgUnits: NUMBER,
          avgAmount: NUMBER
        },
        required: ["name", "tickets", "units", "gross", "discount", "afterDiscount", "net", "avgUnits", "avgAmount"]
      }
    }
  },
  required: ["from", "to", "rows"]
} as const;

const PROMPT = `Lee la tabla del reporte "Productividad del vendedor" y devuelve JSON.

Reglas:
- "from" y "to" salen de "Desde" y "Hasta", en formato YYYY-MM-DD.
- "storeNumber" es el "Nº de tienda".
- Una entrada en "rows" por VENDEDOR. NO incluyas la fila "Promedio".
- Copia el nombre del vendedor TAL CUAL aparece, aunque esté cortado.
- Todos los importes como número, sin signo de pesos ni comas.
- "discount" en POSITIVO aunque en el reporte tenga el signo menos.
- Copia los números exactamente como se ven. No calcules, no corrijas, no
  redondees. Si un dato no se alcanza a leer, pon null.`;

const rowSchema = z.object({
  name: z.string().min(1).max(120),
  tickets: z.number().int().min(0).max(100_000),
  units: z.number().int().min(0).max(1_000_000),
  unitsReturned: z.number().int().min(0).max(1_000_000).nullable().optional(),
  gross: z.number().min(0).max(100_000_000),
  discount: z.number().min(0).max(100_000_000),
  afterDiscount: z.number().min(0).max(100_000_000),
  returns: z.number().min(0).max(100_000_000).nullable().optional(),
  net: z.number().min(0).max(100_000_000),
  avgUnits: z.number().min(0).max(100_000),
  avgAmount: z.number().min(0).max(100_000_000)
});

const responseSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // A veces llega como número (3029) pese al esquema: se acepta y se normaliza.
  storeNumber: z.union([z.string().max(32), z.number()]).nullable().optional(),
  rows: z.array(rowSchema).min(1).max(60)
});

export type VisionOutcome = { ok: true; value: PosReport } | { ok: false; error: string };

export function isVisionConfigured(): boolean {
  return (process.env.GEMINI_API_KEY ?? "").length > 0;
}

export async function readPosReportImage(imageBase64: string, mimeType: string): Promise<VisionOutcome> {
  const key = process.env.GEMINI_API_KEY ?? "";
  if (!key) return { ok: false, error: "La lectura de capturas no está configurada en el servidor." };

  const body = JSON.stringify({
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
    generationConfig: {
      // Temperatura 0: esto es transcribir, no redactar. No queremos que
      // "mejore" un número que se ve mal.
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      // Sin razonamiento: es copiar una tabla, no resolver nada. Con él, la
      // llamada se pasaba del minuto.
      thinkingConfig: { thinkingBudget: 0 }
    }
  });

  let payload: unknown;
  // Un 503 de Gemini es «modelo saturado» y suele pasarse solo. Un reintento
  // evita mandar a teclear a mano por una punta de demanda de treinta segundos.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${ENDPOINT}/${MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body
      });
      if (response.status === 503 && attempt === 0) continue;
      if (!response.ok) {
        return {
          ok: false,
          error: response.status === 503
            ? "El lector de capturas está saturado. Intenta de nuevo en un momento, o sube el PDF."
            : `El lector de capturas respondió ${response.status}. Intenta de nuevo o sube el PDF.`
        };
      }
      payload = await response.json();
      break;
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return { ok: false, error: aborted ? "El lector de capturas tardó demasiado." : "No se pudo contactar al lector de capturas." };
    } finally {
      clearTimeout(timer);
    }
  }
  if (payload === undefined) {
    return { ok: false, error: "El lector de capturas está saturado. Intenta de nuevo en un momento, o sube el PDF." };
  }

  const text = extractText(payload);
  if (!text) return { ok: false, error: "El lector no devolvió nada legible." };

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "El lector no devolvió una tabla válida." };
  }

  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: "La tabla leída viene incompleta. Prueba con una captura más nítida, o sube el PDF." };
  }

  const rows: PosRow[] = parsed.data.rows.map((row) => ({
    name: row.name.trim(),
    tickets: row.tickets,
    units: row.units,
    unitsReturned: row.unitsReturned ?? 0,
    gross: row.gross,
    discount: row.discount,
    afterDiscount: row.afterDiscount,
    returns: row.returns ?? 0,
    net: row.net,
    avgUnits: row.avgUnits,
    avgAmount: row.avgAmount
  }));

  const storeNumber = parsed.data.storeNumber == null ? null : String(parsed.data.storeNumber);
  return { ok: true, value: { from: parsed.data.from, to: parsed.data.to, storeNumber, rows } };
}

/** El texto de la respuesta de Gemini, sin dar por hecha su forma. */
function extractText(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const parts = (candidates[0] as { content?: { parts?: unknown } })?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts.map((part) => (typeof part === "object" && part !== null ? (part as { text?: unknown }).text : null))
    .filter((value): value is string => typeof value === "string")
    .join("");
  return text.trim() || null;
}
