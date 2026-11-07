import { BedrockRuntimeClient, ConverseCommand, type ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import { credencialesBedrock, opcionesDeCliente } from "@/lib/bedrock-credenciales";

/**
 * ¿Es un certificado de curso? Lo lee Haiku por Bedrock, en foto o en PDF.
 *
 * ⚠️ La IA solo EXTRAE --nombre, curso, fecha--; quien decide si completa un
 * curso es el código (`lib/cursos-matriz.ts`): que el curso exista en la matriz
 * de la persona y que el certificado esté a SU nombre. Un modelo que «ve» un
 * certificado donde hay una captura de la clase no puede cerrar nada solo.
 */

const MODELO = process.env.CERTIFICADO_MODEL ?? process.env.BOT_WA_MODEL ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const REGION = process.env.BEDROCK_REGION ?? "us-east-1";

export type LecturaCertificado = { esCertificado: boolean; nombre: string | null; curso: string | null; fecha: string | null };

const INSTRUCCION = `Revisa el archivo: puede ser un PDF, una CAPTURA DE PANTALLA o una FOTO tomada al monitor o al celular (chueca, con reflejos o recortada).
Di si muestra un CERTIFICADO o DIPLOMA de haber completado o aprobado un curso.
Los de Crehana vienen así, de arriba abajo:
  «CERTIFICADO DE APROBACIÓN»
  «Otorga a:» y el NOMBRE COMPLETO de la persona en mayúsculas
  «Por haber completado el curso» y el NOMBRE DEL CURSO (por ejemplo «POS Xstore Admin»)
  una fecha (dd-mm-aaaa), una liga crehana.com/diplomas/… y las firmas de Diego Olcese y Rodolfo Dañino.
Basta con que se lean el nombre de la persona y el del curso bajo esa estructura, aunque la imagen no sea perfecta o falte una parte.
NO es certificado: una captura de una clase o un video, la lista de «Mis cursos», una barra o porcentaje de avance («100% clase vista»), un examen o cualquier otra cosa.
Si el texto no se lee con seguridad, pon null en ese campo; no adivines.
Contesta SOLO con JSON, sin texto alrededor:
{"esCertificado": true|false, "nombre": "nombre de la persona tal cual aparece o null", "curso": "nombre del curso tal cual aparece o null", "fecha": "fecha que aparece o null"}`;

function formatoImagen(mime: string): "jpeg" | "png" | "webp" | "gif" {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpeg";
}

export function leerJson(texto: string): LecturaCertificado | null {
  const limpio = texto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return null;
  try {
    const j = JSON.parse(limpio.slice(inicio, fin + 1)) as Record<string, unknown>;
    const cadena = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return { esCertificado: j.esCertificado === true, nombre: cadena(j.nombre), curso: cadena(j.curso), fecha: cadena(j.fecha) };
  } catch {
    return null;
  }
}

/** `null` = no se pudo leer (sin credenciales, error, respuesta rara). */
export async function leerCertificado(base64: string, mime: string): Promise<LecturaCertificado | null> {
  const credenciales = credencialesBedrock();
  if (!credenciales) return null;
  const bytes = new Uint8Array(Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64"));
  const archivo: ContentBlock = mime.includes("pdf")
    ? { document: { format: "pdf", name: "certificado", source: { bytes } } }
    : { image: { format: formatoImagen(mime), source: { bytes } } };
  const client = new BedrockRuntimeClient({ region: REGION, ...opcionesDeCliente(credenciales) });
  try {
    const res = await client.send(
      new ConverseCommand({
        modelId: MODELO,
        messages: [{ role: "user", content: [archivo, { text: INSTRUCCION }] }],
        inferenceConfig: { maxTokens: 200, temperature: 0 }
      }),
      { abortSignal: AbortSignal.timeout(25_000) }
    );
    const texto = res.output?.message?.content?.map((p) => p.text ?? "").join("") ?? "";
    return leerJson(texto);
  } catch (error) {
    console.error("[certificado-ia]", error instanceof Error ? error.name : error);
    return null;
  }
}
