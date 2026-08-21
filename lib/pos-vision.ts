import { z } from "zod";
import type { PosReport, PosRow } from "@/lib/pos-productivity";
import { bedrockConfigured, readWithBedrock } from "@/lib/pos-vision-bedrock";

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
 * VARIOS modelos, no uno.
 *
 * ⚠️ No fijar uno solo. Medido con el mismo PDF con un día de diferencia:
 * `gemini-3.1-flash-lite` tardó 7.6 s un día y 30.6 s al siguiente, y en medio
 * los dos modelos devolvieron 503 «alta demanda» durante un rato. Elegir el más
 * rápido de un día deja la captura a merced de cómo amanezca ese modelo.
 *
 * Se prueban en orden y se toma el primero que conteste. Todos leen igual de
 * bien —lo que cambia es la latencia—, y la verificación de las cuentas del
 * reporte protege contra cualquiera de ellos.
 */
const MODELS = (process.env.POS_VISION_MODEL ?? "gemini-2.5-flash,gemini-3.5-flash,gemini-3.1-flash-lite")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
/** Por intento. Si uno se atora, se pasa al siguiente en vez de esperar de más. */
const TIMEOUT_MS = 25_000;
/** Tope total, para no dejar a nadie mirando la pantalla un minuto largo. */
const BUDGET_MS = 55_000;

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
  // Con cualquiera de los dos basta: si solo hay Bedrock, la lectura funciona
  // igual y el bloque de captura debe seguir apareciendo.
  return (process.env.GEMINI_API_KEY ?? "").length > 0 || bedrockConfigured();
}

/**
 * Lee el reporte desde una captura de pantalla **o desde el PDF exportado**.
 *
 * El PDF va por aquí y no por un lector propio a propósito. Este reporte no se
 * parece al manifiesto de carga: va **rotado 90°** y su texto está codificado
 * con fuentes subconjunto, cada una con su propia tabla de glifos. Descifrarlo
 * a mano es un extractor de PDF entero —y en la prueba salió a medias, con los
 * nombres destrozados— mientras que mandarlo tal cual sale exacto en 7 s.
 *
 * Y la red es la misma: `posCaptureRows` comprueba después las cuatro cuentas
 * del reporte, venga de donde venga la lectura.
 */
export async function readPosReport(imageBase64: string, mimeType: string): Promise<VisionOutcome> {
  /*
   * Bedrock va PRIMERO cuando está configurado, y Gemini queda de red.
   *
   * No es un cambio de bando: es que si Bedrock tiene un mal momento, la
   * captura del día no puede quedarse sin leer. Es la misma lógica por la que
   * abajo se recorren varios modelos de Gemini en vez de fijar uno.
   *
   * Con `BEDROCK_*` sin configurar, esto no se activa y todo sigue igual que
   * antes — así el despliegue no cambia nada hasta que se quiera.
   */
  if (bedrockConfigured()) {
    const outcome = await readWithBedrock(PROMPT, imageBase64, mimeType);
    if (outcome.ok) {
      const validated = validateVisionText(outcome.text);
      if (validated) return validated;
    }
  }

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

  /**
   * Se recorren los modelos hasta que uno conteste. Un 503 («alta demanda»),
   * un 429 o un intento que se atora NO son el final: son ese modelo teniendo
   * un mal momento, y el siguiente suele responder al instante.
   */
  const startedAt = Date.now();
  let payload: unknown;
  let lastProblem = "";

  for (const model of MODELS) {
    if (Date.now() - startedAt > BUDGET_MS) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body
      });
      if (!response.ok) {
        lastProblem = response.status === 503 || response.status === 429
          ? "saturado"
          : `respondió ${response.status}`;
        continue;
      }
      payload = await response.json();
      break;
    } catch (error) {
      lastProblem = error instanceof Error && error.name === "AbortError" ? "tardó demasiado" : "no se pudo contactar";
      continue;
    } finally {
      clearTimeout(timer);
    }
  }

  if (payload === undefined) {
    return {
      ok: false,
      error: `El lector no está disponible ahora mismo (${lastProblem || "sin respuesta"}). Intenta de nuevo en un par de minutos; si corre prisa, captura los números a mano.`
    };
  }

  const text = extractText(payload);
  if (!text) return { ok: false, error: "El lector no devolvió nada legible." };

  const validated = validateVisionText(text);
  if (!validated) {
    return { ok: false, error: "La tabla leída viene incompleta. Prueba con una captura más nítida, o sube el PDF." };
  }
  return validated;
}

/**
 * Del texto del modelo a la tabla, o `null` si no cuadra.
 *
 * Es la misma puerta para los dos proveedores: **lo que devuelve el modelo NO
 * se cree**, venga de Bedrock o de Gemini. Que la validación viva en un solo
 * sitio es lo que evita que un proveedor nuevo se cuele por una puerta más
 * floja que el otro.
 */
function validateVisionText(text: string): VisionOutcome | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }

  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) return null;

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
