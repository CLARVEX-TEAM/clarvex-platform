/**
 * La llamada al modelo que reparte las fotos del visual entre sus zonas.
 *
 * Va aparte de `visual-reconocer.ts` por lo mismo que `pos-vision-bedrock` va
 * aparte de `pos-vision`: alli esta el prompt y la comprobacion de la
 * respuesta, que es lo que hay que poder probar sin red. Aqui solo se manda y
 * se devuelve texto.
 *
 * ⚠️ **Aqui SI hace falta el modelo grande.** Medido contra reportes reales de
 * la tienda, con las referencias de tres semanas antes y cambio de temporada de
 * por medio: Haiku acierta 11 de 13 y confunde MSW 1 con MSW 2; Sonnet acierta
 * 13 de 13. El lector del POS usa Haiku porque transcribe numeros de una tabla;
 * esto es reconocer un sitio por sus detalles fijos, y no es lo mismo.
 *
 * Corre una vez por semana con unos 24 mil tokens de entrada. El costo es de
 * centavos al mes; bajar de modelo aqui ahorra nada y cuesta un cruce de zonas.
 */
import { bedrockDisponible, credencialesBedrock, opcionesDeCliente } from "@/lib/bedrock-credenciales";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { FotoAnonima, Referencia } from "@/lib/visual-reconocer";

const MODEL = process.env.VISUAL_RECONOCER_MODEL ?? "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
const REGION = process.env.BEDROCK_REGION ?? "us-east-1";
/** Veintiseis imagenes tardan unos 17 s. El margen es para un mal dia. */
const TIMEOUT_MS = 90_000;

export type ReconocerOutcome = { ok: true; text: string } | { ok: false; problem: string };

export function reconocerConfigurado(): boolean {
  return bedrockDisponible();
}

export async function repartirConBedrock(
  prompt: string,
  referencias: Referencia[],
  fotos: FotoAnonima[]
): Promise<ReconocerOutcome> {
  const credenciales = credencialesBedrock();
  if (!credenciales) return { ok: false, problem: "sin credenciales" };

  /*
   * ⚠️ El orden importa: primero el encargo, luego cada zona con su nombre
   * DELANTE de su foto, y al final las nuevas numeradas. Poner el nombre
   * detras haria que el modelo tuviera que adivinar a cual de las dos
   * imagenes vecinas pertenece.
   */
  const content: Array<Record<string, unknown>> = [{ text: prompt }];
  for (const ref of referencias) {
    content.push({ text: `ZONA: ${ref.etiqueta}` });
    content.push({ image: { format: "jpeg", source: { bytes: ref.contenido } } });
  }
  content.push({ text: "--- FOTOS NUEVAS ---" });
  fotos.forEach((foto, i) => {
    content.push({ text: `FOTO ${i + 1}` });
    content.push({ image: { format: "jpeg", source: { bytes: foto.contenido } } });
  });

  const client = new BedrockRuntimeClient({ region: REGION, ...opcionesDeCliente(credenciales) });

  try {
    const response = await client.send(
      new ConverseCommand({
        modelId: MODEL,
        messages: [{ role: "user", content: content as never }],
        // Temperatura 0: esto es reconocer, no proponer.
        inferenceConfig: { maxTokens: 3000, temperature: 0 }
      }),
      { abortSignal: AbortSignal.timeout(TIMEOUT_MS) }
    );

    const text = response.output?.message?.content?.find((part) => part.text)?.text ?? "";
    if (!text) return { ok: false, problem: "no devolvio texto" };
    return { ok: true, text };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, problem: "tardo demasiado" };
    if (name === "ThrottlingException") return { ok: false, problem: "saturado" };
    const detalle = error instanceof Error ? error.message.slice(0, 120) : "";
    return { ok: false, problem: `no se pudo contactar${detalle ? `: ${detalle}` : ""}` };
  }
}
