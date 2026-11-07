/**
 * Gestos de WhatsApp del bot: «escribiendo…» mientras piensa y una reacción
 * al mensaje recibido. Detalles de cortesía: nunca lanzan y nunca esperan
 * más de unos segundos, porque ninguno vale una respuesta tardía.
 */

function config() {
  const baseUrl = process.env.WHATSAPP_EVOLUTION_URL?.replace(/\/$/, "") ?? "";
  const apiKey = process.env.WHATSAPP_EVOLUTION_API_KEY ?? "";
  const instance = encodeURIComponent(process.env.WHATSAPP_EVOLUTION_INSTANCE ?? "tienda");
  return baseUrl && apiKey ? { baseUrl, apiKey, instance } : null;
}

async function llamar(ruta: string, cuerpo: unknown): Promise<void> {
  const c = config();
  if (!c) return;
  try {
    await fetch(`${c.baseUrl}${ruta}/${c.instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: c.apiKey },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(4000)
    });
  } catch {
    // Un gesto que no sale no se reintenta.
  }
}

/**
 * ⚠️ Evolution sostiene la petición mientras dura `delay`: no se espera, o el
 * bot tardaría eso de más en contestar.
 */
export function mostrarEscribiendo(remoteJid: string, ms = 4000): void {
  void llamar("/chat/sendPresence", { number: remoteJid, presence: "composing", delay: ms });
}

export async function reaccionar(mensaje: { remoteJid: string; id: string }, emoji: string): Promise<void> {
  await llamar("/message/sendReaction", { key: { remoteJid: mensaje.remoteJid, fromMe: false, id: mensaje.id }, reaction: emoji });
}
