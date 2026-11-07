import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { credencialesBedrock, opcionesDeCliente } from "@/lib/bedrock-credenciales";
import { turnosAlternados } from "@/lib/bot-whatsapp-contexto";

/**
 * La IA del bot de WhatsApp: contestar y transcribir notas de voz.
 *
 * Contesta Haiku por Bedrock --lo paga el crédito de AWS-- y Groq queda de
 * respaldo. Antes era solo Groq con `gpt-oss-20b` y 220 tokens: inventaba
 * horarios que no tenía y cortaba respuestas a media frase.
 */

const MODELO = process.env.BOT_WA_MODEL ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const REGION = process.env.BEDROCK_REGION ?? "us-east-1";
const TIEMPO_MS = 15_000;

async function conBedrock(sistema: string, historial: string[], mensaje: string): Promise<string | null> {
  const credenciales = credencialesBedrock();
  if (!credenciales) return null;
  const client = new BedrockRuntimeClient({ region: REGION, ...opcionesDeCliente(credenciales) });
  try {
    const res = await client.send(
      new ConverseCommand({
        modelId: MODELO,
        system: [{ text: sistema }],
        messages: turnosAlternados(historial, mensaje).map((t) => ({ role: t.role, content: [{ text: t.text }] })),
        inferenceConfig: { maxTokens: 400, temperature: 0.4 }
      }),
      { abortSignal: AbortSignal.timeout(TIEMPO_MS) }
    );
    const texto = res.output?.message?.content?.map((p) => p.text ?? "").join("").trim();
    return texto || null;
  } catch (error) {
    console.error("[bot-whatsapp] bedrock", error instanceof Error ? error.name : error);
    return null;
  }
}

async function conGroq(sistema: string, historial: string[], mensaje: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const baseUrl = (process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const model = process.env.AI_MODEL_FAST ?? "openai/gpt-oss-20b";
  const messages = [
    { role: "system", content: sistema },
    ...turnosAlternados(historial, mensaje).map((t) => ({ role: t.role, content: t.text }))
  ];
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 400 }),
      signal: AbortSignal.timeout(TIEMPO_MS)
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

export async function responderBot(sistema: string, historial: string[], mensaje: string): Promise<string | null> {
  return (await conBedrock(sistema, historial, mensaje)) ?? (await conGroq(sistema, historial, mensaje));
}

/**
 * Nota de voz → texto, con Whisper en Groq.
 *
 * ⚠️ `null` significa «no se pudo», y el webhook se lo DICE a la persona. Un
 * audio ignorado en silencio es justo lo que pasaba antes: el bot no contestaba
 * y nadie sabía por qué.
 */
export async function transcribirAudio(base64: string, mimetype: string | null): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const baseUrl = (process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const tipo = (mimetype ?? "audio/ogg").split(";")[0];
  const extension = tipo.includes("mp4") || tipo.includes("m4a") ? "m4a" : tipo.includes("mpeg") ? "mp3" : "ogg";
  const datos = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;

  const form = new FormData();
  form.append("file", new Blob([Buffer.from(datos, "base64")], { type: tipo }), `nota.${extension}`);
  form.append("model", process.env.BOT_WA_WHISPER ?? "whisper-large-v3-turbo");
  form.append("language", "es");
  form.append("response_format", "json");
  try {
    const res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(30_000)
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { text?: string };
    return json.text?.trim() || null;
  } catch {
    return null;
  }
}
