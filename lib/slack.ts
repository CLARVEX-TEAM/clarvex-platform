/**
 * Publicar en Slack con el nombre de quien lo escribió.
 *
 * ⚠️ La pieza que hace viable todo esto es el permiso **`chat:write.customize`**:
 * deja que el bot publique con el `username` de cada asesor. Sin él, los trece
 * mensajes del día aparecerían firmados por «Clarvex» y habría que leer quién
 * los mandó dentro del texto. Con él, **nadie del equipo necesita cuenta de
 * Slack** — que era el muro de toda la idea.
 */

import { llaveDeImagen, subirASlack } from "@/lib/slack-archivos";

const API = "https://slack.com/api/chat.postMessage";
const TIMEOUT_MS = 8_000;

export function slackChatConfigurado(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHAT_CHANNELS);
}

export type SlackEnvio = { ok: true; ts: string } | { ok: false; problema: string };

/**
 * Manda un mensaje. **Nunca lanza**: es un espejo, no la escritura principal.
 *
 * Si Slack está caído, el mensaje ya está guardado en Clarvex y el equipo lo ve
 * igual. Romper el envío de un mensaje del asesor porque un canal externo no
 * responde sería cambiar un problema pequeño por uno grande.
 */
export async function publicarEnSlack(canal: string, autor: string, texto: string): Promise<SlackEnvio> {
  const token = process.env.SLACK_BOT_TOKEN ?? "";
  if (!token) return { ok: false, problema: "sin token" };

  try {
    const respuesta = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`
      },
      /*
       * ⚠️ Sin `icon_url`. La foto de perfil vive en R2, que es un bucket
       * PRIVADO: la única URL que se puede dar es firmada y caduca a las seis
       * horas. Slack la resuelve al pintar, no al recibir, así que el avatar se
       * rompería en todo el historial. Mejor solo el nombre, que no se pudre.
       */
      body: JSON.stringify({ channel: canal, username: autor, text: texto }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    /*
     * ⚠️ Slack contesta 200 aunque falle. El error va DENTRO del cuerpo, en
     * `ok:false` con un campo `error`. Mirar solo el código HTTP daría por
     * bueno un `channel_not_found` o un `invalid_auth`.
     */
    const datos = (await respuesta.json()) as { ok?: boolean; ts?: string; error?: string };
    if (!datos.ok) return { ok: false, problema: datos.error ?? `http ${respuesta.status}` };
    return { ok: true, ts: datos.ts ?? "" };
  } catch (error) {
    const nombre = error instanceof Error ? error.name : "";
    if (nombre === "TimeoutError" || nombre === "AbortError") return { ok: false, problema: "tardo demasiado" };
    return { ok: false, problema: "no se pudo contactar" };
  }
}

/**
 * Lo mismo, pero sin esperar y sin poder tumbar a quien lo llama.
 *
 * ⚠️ Si el cuerpo es una IMAGEN del chat, sube el archivo en vez de publicar su
 * texto. Sin esto, en el canal aparecía `[img:/api/chat/file?k=…]` tal cual:
 * ilegible, y enseñando de paso cómo se guardan las cosas por dentro.
 *
 * Y si la foto no se puede subir, se avisa en texto de que la hubo. Un mensaje
 * que dice «mandó una foto» es peor que ver la foto, pero mucho mejor que el
 * silencio: el equipo sabe que hay algo que mirar en Clarvex.
 */
export function publicarEnSlackSinEsperar(canal: string, autor: string, texto: string): void {
  const llave = llaveDeImagen(texto);
  if (llave) {
    void subirASlack(llave, canal, autor).then((ok) => {
      if (!ok) void publicarEnSlack(canal, autor, "📷 mandó una foto (no se pudo traer; está en Clarvex)");
    });
    return;
  }
  void publicarEnSlack(canal, autor, texto).then((r) => {
    if (!r.ok) console.warn(`[slack-chat] no se pudo reflejar en ${canal}: ${r.problema}`);
  });
}
