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
  /** URL pública o data URL base64 de la imagen. */
  mediaUrl: string;
  caption?: string;
};

export async function enviarMediaPorWhatsApp(aviso: MediaWhatsApp): Promise<void> {
  const baseUrl = process.env.WHATSAPP_EVOLUTION_URL;
  const apiKey = process.env.WHATSAPP_EVOLUTION_API_KEY;
  const instance = process.env.WHATSAPP_EVOLUTION_INSTANCE ?? "tienda";
  if (!baseUrl || !apiKey) {
    console.warn("[whatsapp-media] Evolution no configurada; se omite el envío.");
    return;
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
        media: aviso.mediaUrl,
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
  } catch (error) {
    console.error(
      `[whatsapp-media] no se pudo enviar media a ${aviso.phone}: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timer);
  }
}
