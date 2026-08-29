/**
 * Las fotos que cruzan entre el chat de Clarvex y Slack.
 *
 * Va aparte de `lib/slack.ts` porque son tres llamadas encadenadas y un
 * formato propio, y porque **una foto que no cruza no puede costar el
 * mensaje**: todo lo de aquí falla hacia el lado seguro.
 *
 * ⚠️ Slack retiró `files.upload`. Ahora son tres pasos: pedir una URL, subir
 * los bytes a esa URL —que NO es la API— y avisar de que se completó diciendo
 * a qué canal va. Saltarse el tercero deja el archivo subido y sin publicar.
 */
import { getFromR2, uploadToR2 } from "@/lib/r2";
import { storeKey } from "@/lib/r2-keys";

/** El formato con el que el chat guarda una imagen. Ver chat-message-guard. */
const IMG = /^\[img:(\/api\/chat\/file\?k=([^\]]+))\]$/;

/** Tope: por encima de esto no se cruza. Es una foto de tienda, no un vídeo. */
const MAX_BYTES = 8 * 1024 * 1024;

const TIPOS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** ¿Este cuerpo es una imagen del chat? Devuelve su llave de R2. */
export function llaveDeImagen(body: string): string | null {
  const m = IMG.exec(body.trim());
  return m ? decodeURIComponent(m[2]) : null;
}

/** El cuerpo que guarda el chat para una imagen ya subida a R2. */
export function cuerpoDeImagen(key: string): string {
  return `[img:/api/chat/file?k=${encodeURIComponent(key)}]`;
}

/* ─── de Slack a Clarvex ──────────────────────────────────────────────────── */

export type ArchivoDeSlack = {
  url_private_download?: string;
  mimetype?: string;
  size?: number;
  name?: string;
};

/**
 * Baja la foto de Slack y la guarda en R2, devolviendo el cuerpo del mensaje.
 *
 * `null` si no se pudo. Quien llama **sigue adelante con el texto**: perder la
 * foto es una lástima, perder el comunicado entero no.
 */
export async function traerDeSlack(
  archivo: ArchivoDeSlack,
  storeId: string,
  roomId: string
): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN ?? "";
  const url = archivo.url_private_download;
  if (!token || !url) return null;

  const tipo = (archivo.mimetype ?? "").toLowerCase();
  if (!TIPOS.has(tipo)) return null;
  if ((archivo.size ?? 0) > MAX_BYTES) return null;

  try {
    // ⚠️ La URL es privada: sin la cabecera devuelve la pantalla de acceso de
    // Slack, en HTML y con código 200. Habría que guardar eso como si fuera la
    // foto.
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000)
    });
    if (!r.ok) return null;

    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;

    const ext = tipo.split("/")[1].replace("jpeg", "jpg");
    const key = storeKey(storeId, "chat", `${roomId}/slack-${Date.now()}-${crypto.randomUUID()}.${ext}`);
    await uploadToR2(key, bytes, tipo);
    return cuerpoDeImagen(key);
  } catch {
    return null;
  }
}

/* ─── de Clarvex a Slack ──────────────────────────────────────────────────── */

/**
 * Sube a Slack una imagen que vive en R2.
 *
 * ⚠️ Sin esto, el espejo publicaba en el canal el texto crudo
 * `[img:/api/chat/file?k=…]`: ilegible, y además enseñando cómo se guardan las
 * cosas por dentro.
 */
export async function subirASlack(key: string, canal: string, autor: string): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN ?? "";
  if (!token) return false;

  try {
    const objeto = await getFromR2(key);
    if (!objeto || objeto.body.length === 0 || objeto.body.length > MAX_BYTES) return false;

    const nombre = key.split("/").pop() || "foto.jpg";

    // 1) Slack da una URL de un solo uso, que NO es la de la API.
    const pedir = new URLSearchParams({ filename: nombre, length: String(objeto.body.length) });
    const uno = (await (
      await fetch(`https://slack.com/api/files.getUploadURLExternal?${pedir}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000)
      })
    ).json()) as { ok?: boolean; upload_url?: string; file_id?: string; error?: string };
    if (!uno.ok || !uno.upload_url || !uno.file_id) return false;

    // 2) Los bytes van a esa URL, sin token y como octet-stream.
    const dos = await fetch(uno.upload_url, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: objeto.body as unknown as BodyInit,
      signal: AbortSignal.timeout(30_000)
    });
    if (!dos.ok) return false;

    /*
     * 3) Y hay que COMPLETAR diciendo a qué canal va. Sin este paso el archivo
     * queda subido y sin publicar: no da error y no aparece en ninguna parte.
     */
    const tres = (await (
      await fetch("https://slack.com/api/files.completeUploadExternal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          files: [{ id: uno.file_id, title: nombre }],
          channel_id: canal,
          initial_comment: `${autor} envió una foto`
        }),
        signal: AbortSignal.timeout(15_000)
      })
    ).json()) as { ok?: boolean; error?: string };

    if (!tres.ok) {
      console.warn(`[slack-archivos] no se pudo publicar la foto: ${tres.error ?? "?"}`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
