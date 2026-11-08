import { BedrockRuntimeClient, ConverseCommand, type ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import { credencialesBedrock, opcionesDeCliente } from "@/lib/bedrock-credenciales";
import type { LecturaMarcaje, Pantalla } from "@/lib/marcaje-pos";

/**
 * ¿Qué es la foto que le mandaron al bot? Una sola llamada a Haiku que la
 * CLASIFICA y, si es la pantalla de marcaje del POS, la LEE.
 *
 *   marcaje      → asistencia (`lib/marcaje-registro.ts`)
 *   certificado  → el flujo de pendientes y cursos de siempre
 *   otra         → pendientes si tiene alguno abierto; si no, se le pregunta qué es
 *
 * ⚠️ La IA solo extrae. Que el número sea de quien la manda, que la fecha sea
 * hoy y qué se escribe lo decide el código (`lib/marcaje-pos.ts`).
 */

const MODELO = process.env.CERTIFICADO_MODEL ?? process.env.BOT_WA_MODEL ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const REGION = process.env.BEDROCK_REGION ?? "us-east-1";

export type TipoFoto = "marcaje" | "certificado" | "otra";
export type LecturaFoto = { tipo: TipoFoto; marcaje: LecturaMarcaje | null };

const INSTRUCCION = `Clasifica la imagen (puede ser una FOTO tomada a un monitor, chueca o con reflejos):

1. "marcaje": la pantalla del punto de venta para marcar asistencia. Título grande «Marcar entrada» o «Marcar salida», fondo de color, y los renglones:
   Asesor: <número> - <NOMBRE>
   Estado: Marcar salida - dd/mm/aaaa hh:mm a. m./p. m.   (o «Marcar entrada - …»)
   Fecha: dd/mm/aaaa
   Hora: dd/mm/aaaa hh:mm a. m./p. m.
2. "certificado": un certificado o diploma de haber completado un curso.
3. "otra": cualquier otra cosa.

Si es "marcaje", copia los datos TAL CUAL se ven:
- "pantalla": "entrada" si el título dice «Marcar entrada», "salida" si dice «Marcar salida».
- "numeroEmpleado": solo el número que va antes del guion en «Asesor».
- "fecha": la del renglón «Fecha».
- "hora": solo la hora del renglón «Hora», con su a. m./p. m. (ej. «10:43 a. m.»).
- "ultimaMarca": del renglón «Estado»: "accion" "salida" si dice «Marcar salida», "entrada" si dice «Marcar entrada», con su "fecha" y "hora". null si no se lee.
Si un dato no se lee con seguridad, pon null; no adivines ni cambies un dígito.

Contesta SOLO con JSON, sin texto alrededor:
{"tipo": "marcaje"|"certificado"|"otra", "pantalla": "entrada"|"salida"|null, "numeroEmpleado": "…"|null, "fecha": "dd/mm/aaaa"|null, "hora": "hh:mm a. m."|null, "ultimaMarca": {"accion": "salida"|"entrada", "fecha": "dd/mm/aaaa", "hora": "hh:mm p. m."}|null}`;

function formatoImagen(mime: string): "jpeg" | "png" | "webp" | "gif" {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpeg";
}

const cadena = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const pantalla = (v: unknown): Pantalla | null => (v === "entrada" || v === "salida" ? v : null);

export function leerJsonFoto(texto: string): LecturaFoto | null {
  const limpio = texto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return null;
  try {
    const j = JSON.parse(limpio.slice(inicio, fin + 1)) as Record<string, unknown>;
    const tipo: TipoFoto = j.tipo === "marcaje" || j.tipo === "certificado" ? j.tipo : "otra";
    if (tipo !== "marcaje") return { tipo, marcaje: null };
    const u = j.ultimaMarca as Record<string, unknown> | null | undefined;
    const accion = pantalla(u?.accion);
    const uf = cadena(u?.fecha);
    const uh = cadena(u?.hora);
    return {
      tipo,
      marcaje: {
        pantalla: pantalla(j.pantalla),
        numeroEmpleado: cadena(j.numeroEmpleado),
        fecha: cadena(j.fecha),
        hora: cadena(j.hora),
        ultimaMarca: accion && uf && uh ? { accion, fecha: uf, hora: uh } : null
      }
    };
  } catch {
    return null;
  }
}

/** `null` = no se pudo leer (sin credenciales, error, respuesta rara): sigue el camino de siempre. */
export async function clasificarFoto(base64: string, mime: string): Promise<LecturaFoto | null> {
  // Un PDF nunca es la pantalla del POS: no se gasta la llamada.
  if (mime.includes("pdf")) return { tipo: "certificado", marcaje: null };
  const credenciales = credencialesBedrock();
  if (!credenciales) return null;
  const bytes = new Uint8Array(Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64"));
  const imagen: ContentBlock = { image: { format: formatoImagen(mime), source: { bytes } } };
  const client = new BedrockRuntimeClient({ region: REGION, ...opcionesDeCliente(credenciales) });
  try {
    const res = await client.send(
      new ConverseCommand({
        modelId: MODELO,
        messages: [{ role: "user", content: [imagen, { text: INSTRUCCION }] }],
        inferenceConfig: { maxTokens: 300, temperature: 0 }
      }),
      { abortSignal: AbortSignal.timeout(25_000) }
    );
    const texto = res.output?.message?.content?.map((p) => p.text ?? "").join("") ?? "";
    return leerJsonFoto(texto);
  } catch (error) {
    console.error("[foto-bot-ia]", error instanceof Error ? error.name : error);
    return null;
  }
}
