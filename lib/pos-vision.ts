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
- "discount", "unitsReturned" y "returns" en POSITIVO aunque en el reporte
  aparezcan con el signo menos. Son las tres columnas que el reporte muestra en
  negativo.
- "net", "avgUnits" y "avgAmount" van CON su signo. Si el reporte los muestra en
  negativo, cópialos en negativo: es un día de devoluciones y así tiene que ser.
- Copia los números exactamente como se ven. No calcules, no corrijas, no
  redondees. Si un dato no se alcanza a leer, pon null.`;

/**
 * La forma exacta del JSON, para Bedrock.
 *
 * ⚠️ Gemini NO la necesita: se le manda `RESPONSE_SCHEMA` y el formato deja de
 * ser cosa suya. Bedrock no tiene ese mecanismo, y sin describirle la forma
 * **se inventa los nombres de los campos** — devolvía `vendorName` por `name` y
 * `bruttoSales` por `gross`, y de paso confundía columnas.
 *
 * El daño no era una lectura fallida: la validación la rechazaba, se caía a
 * Gemini, y la captura acababa tardando la SUMA de los dos. Más lenta que antes
 * de tener Bedrock.
 *
 * Si se agrega o renombra un campo en `rowSchema`, hay que tocarlo aquí también.
 */
const SHAPE = `Devuelve SOLO el JSON, sin texto alrededor, con esta forma exacta
y estos nombres de campo:

{"from":"AAAA-MM-DD","to":"AAAA-MM-DD","storeNumber":"","rows":[{"name":"","tickets":0,"units":0,"unitsReturned":0,"gross":1499.00,"discount":599.60,"afterDiscount":899.40,"returns":0.00,"net":899.40,"avgUnits":1.00,"avgAmount":899.40}]}

⚠️ LOS IMPORTES LLEVAN DOS DECIMALES. Cópialos completos y mira bien cada
dígito: las cuentas del reporte se comprueban después y basta un número mal
leído para que la captura se detenga.

Correspondencia con las columnas del reporte:
- name = Nombre del vendedor
- tickets = Tickets, units = Unidades Vendido, unitsReturned = Unidades Dev.
- gross = Bruto Ventas, discount = Ventas Descuento (en positivo)
- afterDiscount = Ventas posteriores Descuentos
- returns = Bruto Devoluciones, net = Neto Ventas
- avgUnits = Prom. Unidades, avgAmount = Prom. Monto

⚠️ "net", "avgUnits" y "avgAmount" LLEVAN SU SIGNO. En un día de devoluciones
salen en negativo y así hay que copiarlos.`;

const rowSchema = z.object({
  name: z.string().min(1).max(120),
  tickets: z.number().int().min(0).max(100_000),
  units: z.number().int().min(0).max(1_000_000),
  /*
   * ⚠️ Se acepta con signo y se normaliza después con `Math.abs`.
   *
   * El reporte muestra las devoluciones en NEGATIVO («-4», «-$5,896.00») y el
   * modelo a veces las copia tal cual, aunque el prompt pida positivo. Con
   * `.min(0)` toda la lectura se caía por un signo, y el día que se cae es
   * justo el día que hubo una devolución. Aquí solo interesa la magnitud: el
   * sentido ya lo da el nombre de la columna.
   */
  unitsReturned: z.number().int().min(-1_000_000).max(1_000_000).nullable().optional(),
  /** El bruto SÍ tiene suelo: una devolución vive en su propia columna. */
  gross: z.number().min(0).max(100_000_000),
  /** Con signo o sin él: la dirección la decide `discountAsReduction`. */
  discount: z.number().min(-100_000_000).max(100_000_000),
  afterDiscount: z.number().min(0).max(100_000_000),
  /** Igual que `unitsReturned`: llega en negativo y se normaliza con `Math.abs`. */
  returns: z.number().min(-100_000_000).max(100_000_000).nullable().optional(),
  /*
   * ⚠️ Estos TRES pueden ser negativos de verdad, y ponerles suelo tumbaba el
   * reporte entero.
   *
   * Un día en que alguien solo atiende una devolución deja su neto en rojo, y
   * con él el promedio de unidades y el de monto, que salen de dividirlo. El
   * 27 de agosto de 2026 la lectura se rechazaba con «la tabla viene
   * incompleta» —culpando a la nitidez de la captura— cuando la captura estaba
   * perfecta y el reporte era correcto.
   */
  net: z.number().min(-100_000_000).max(100_000_000),
  avgUnits: z.number().min(-100_000).max(100_000),
  avgAmount: z.number().min(-100_000_000).max(100_000_000)
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
    const outcome = await readWithBedrock(`${PROMPT}\n\n${SHAPE}`, imageBase64, mimeType);
    if (outcome.ok) {
      const validated = validateVisionText(outcome.text);
      if (validated.ok) return validated;
      /*
       * Si llegó respuesta pero no valida, hay que ENTERARSE.
       *
       * El respaldo a Gemini salva la captura, pero al hacerlo esconde el
       * problema: la lectura empieza a tardar la suma de los dos y desde fuera
       * parece que Bedrock «no sirve». Fue exactamente lo que pasó el 21 de
       * agosto de 2026 —el modelo devolvía `vendorName` en vez de `name`— y sin
       * este aviso no había forma de verlo en los logs.
       */
      console.warn(`[pos-vision] Bedrock respondió pero la tabla no validó (${validated.reason}); se cae a Gemini.`);
    } else {
      console.warn(`[pos-vision] Bedrock no respondió (${outcome.problem}); se cae a Gemini.`);
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
  if (!validated.ok) {
    console.warn(`[pos-vision] la tabla no validó: ${validated.reason}`);
    return {
      ok: false,
      error: `La tabla leída no encaja con el reporte (${validated.reason}). Prueba con una captura más nítida, o sube el PDF.`
    };
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
export type Validation = { ok: true; value: PosReport } | { ok: false; reason: string };

export function validateVisionText(text: string): Validation {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "la respuesta no era JSON" };
  }

  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) {
    /*
     * ⚠️ Decir QUÉ falló, no suponerlo.
     *
     * Este mensaje decía siempre «prueba con una captura más nítida», y el 27
     * de agosto de 2026 mandó a buscar una captura mejor por un reporte que
     * estaba perfecto: lo que fallaba era un límite del esquema, no la imagen.
     * Nombrar el campo convierte una tarde de reintentos en un vistazo al log.
     */
    const issue = parsed.error.issues[0];
    const campo = issue && issue.path.length > 0 ? issue.path.join(".") : "la respuesta";
    return { ok: false, reason: `${campo}: ${issue?.message ?? "no encaja"}` };
  }

  const rows: PosRow[] = parsed.data.rows.map((row) => ({
    name: row.name.trim(),
    tickets: row.tickets,
    units: row.units,
    // Solo interesa la magnitud: el reporte las muestra en negativo.
    unitsReturned: Math.abs(row.unitsReturned ?? 0),
    gross: row.gross,
    discount: row.discount,
    afterDiscount: row.afterDiscount,
    returns: Math.abs(row.returns ?? 0),
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
