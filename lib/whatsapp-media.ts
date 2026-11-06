/**
 * Envío de IMAGEN por WhatsApp (Evolution API sendMedia) — usado para reenviar
 * a gerencia las fotos de evidencia que mandan los empleados al bot.
 *
 * Mismas reglas que lib/whatsapp-aviso.ts: nunca lanza, sin config no manda
 * nada, con timeout.
 */

export type MediaWhatsApp = {
  /** Número con código de país, p. ej. "528116044697". */
  phone: string;
  /** URL pública o base64 de la imagen; un prefijo `data:` se quita antes de enviar. */
  mediaUrl: string;
  caption?: string;
};

/**
 * ⚠️ Evolution rechaza con 400 un data URL: `media` es una URL o el base64 pelón.
 * Devuelve si se entregó, para que quien llama no dé por enviada una foto que no salió.
 */
export async function enviarMediaPorWhatsApp(aviso: MediaWhatsApp): Promise<boolean> {
  const baseUrl = process.env.WHATSAPP_EVOLUTION_URL;
  const apiKey = process.env.WHATSAPP_EVOLUTION_API_KEY;
  const instance = process.env.WHATSAPP_EVOLUTION_INSTANCE ?? "tienda";
  if (!baseUrl || !apiKey) {
    console.warn("[whatsapp-media] Evolution no configurada; se omite el envío.");
    return false;
  }

  const number = aviso.phone.includes("@") ? aviso.phone : `${aviso.phone}@s.whatsapp.net`;
  const url = `${baseUrl.replace(/\/$/, "")}/message/sendMedia/${encodeURIComponent(instance)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({
        number,
        mediatype: "image",
        mimetype: "image/jpeg",
        media: aviso.mediaUrl.replace(/^data:[^,]*;base64,/, ""),
        caption: aviso.caption ?? "",
        fileName: "evidencia.jpg"
      }),
      signal: ac.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        `[whatsapp-media] Evolution respondió ${response.status} al enviar media a ${aviso.phone}: ${body.slice(0, 200)}`
      );
    }
    return response.ok;
  } catch (error) {
    console.error(
      `[whatsapp-media] no se pudo enviar media a ${aviso.phone}: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}
