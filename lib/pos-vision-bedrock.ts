import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

/**
 * Lectura del reporte del POS con Amazon Bedrock.
 *
 * Vive aparte de `lib/pos-vision` para que ese módulo siga siendo el que manda:
 * ahí está el prompt, la validación con zod y la comprobación de las cuentas
 * del reporte. Aquí solo se hace la llamada y se devuelve texto.
 *
 * Medido el 21 de agosto de 2026 con una captura real y el mismo prompt de
 * producción: 12 de 12 campos correctos en 3.7 s, contra los 10-15 s de Gemini.
 *
 * ⚠️ Credenciales con nombre PROPIO (`BEDROCK_*`), no las genéricas `AWS_*`.
 * El cliente de R2 también es del SDK de AWS: unas variables `AWS_*` sueltas en
 * el entorno podrían acabar mandando las fotos a otra parte. Con nombres
 * propios y credenciales explícitas, cada cosa va a donde debe.
 */

/**
 * El ID del catálogo NO se puede invocar directo: hay que usar el perfil de
 * inferencia, con prefijo `us.`. Sin él, Bedrock responde que el modelo «no
 * admite rendimiento bajo demanda», que no es nada obvio.
 */
const MODEL = process.env.BEDROCK_POS_MODEL ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const REGION = process.env.BEDROCK_REGION ?? "us-east-1";
const TIMEOUT_MS = 25_000;

export function bedrockConfigured(): boolean {
  return Boolean(process.env.BEDROCK_ACCESS_KEY_ID && process.env.BEDROCK_SECRET_ACCESS_KEY);
}

/** Formato de imagen que espera Bedrock, deducido del mime type. */
function imageFormat(mimeType: string): "png" | "jpeg" | "webp" | "gif" | null {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpeg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return null;
}

/**
 * Quita la envoltura de bloque de código.
 *
 * ⚠️ Bedrock devuelve el JSON dentro de ```json … ```, a diferencia de Gemini,
 * que lo entrega limpio porque se le manda un esquema de respuesta. Sin quitarlo
 * el `JSON.parse` falla siempre y la lectura se cae en el último paso, ya con el
 * trabajo hecho.
 */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
}

export type BedrockOutcome =
  | { ok: true; text: string }
  | { ok: false; problem: string };

/** Una sola llamada. El PDF va como documento; la imagen, como imagen. */
export async function readWithBedrock(
  prompt: string,
  dataBase64: string,
  mimeType: string
): Promise<BedrockOutcome> {
  const accessKeyId = process.env.BEDROCK_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.BEDROCK_SECRET_ACCESS_KEY ?? "";
  if (!accessKeyId || !secretAccessKey) return { ok: false, problem: "sin credenciales" };

  const bytes = Buffer.from(dataBase64, "base64");
  /*
   * ⚠️ Bedrock rechaza imágenes de más de 5 MB, y lo hace DESPUÉS de subirlas:
   * se paga la espera para nada y luego se cae a Gemini. Una foto del monitor
   * con el celular pesa 5-8 MB y llega aquí tal cual si el navegador no la
   * encogió (el recorte de Retool lo evita, pero este módulo no puede darlo
   * por hecho). Mejor ni intentarlo y dejar que Gemini lo lea de una vez.
   */
  if (bytes.length > 4_500_000) {
    return { ok: false, problem: `la imagen pesa ${(bytes.length / 1024 / 1024).toFixed(1)} MB y el máximo son 5` };
  }
  const format = imageFormat(mimeType);
  const content = format
    ? [{ image: { format, source: { bytes } } }, { text: prompt }]
    : [
        // Un PDF va como documento. El nombre es obligatorio y Bedrock solo
        // admite letras, números, guiones y espacios.
        { document: { format: "pdf" as const, name: "reporte", source: { bytes } } },
        { text: prompt }
      ];

  const client = new BedrockRuntimeClient({
    region: REGION,
    credentials: { accessKeyId, secretAccessKey }
  });

  try {
    const response = await client.send(
      new ConverseCommand({
        modelId: MODEL,
        messages: [{ role: "user", content }],
        // Temperatura 0: esto es transcribir, no redactar.
        inferenceConfig: { maxTokens: 4000, temperature: 0 }
      }),
      { abortSignal: AbortSignal.timeout(TIMEOUT_MS) }
    );

    const text = response.output?.message?.content?.find((part) => part.text)?.text ?? "";
    if (!text) return { ok: false, problem: "no devolvió texto" };
    return { ok: true, text: stripCodeFence(text) };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, problem: "tardó demasiado" };
    if (name === "ThrottlingException") return { ok: false, problem: "saturado" };
    return { ok: false, problem: "no se pudo contactar" };
  }
}
