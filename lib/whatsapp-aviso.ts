/**
 * Envío de un aviso PRIVADO por WhatsApp (Evolution API → número personal).
 *
 * Mismo diseño que lib/whatsapp.ts (fire-and-forget, sin lanzar, con timeout),
 * pero dirigido a UN empleado en vez de al grupo. Pensado para los
 * recordatorios del workflow n8n («KIMI …») y otros avisos 1-a-1.
 *
 * Reglas:
 * 1. Nunca lanza. Si Evolution está caída, el aviso se pierde y se anota en
 *    consola; no se rompe el recordatorio ni la operación de la tienda.
 * 2. Sin `WHATSAPP_EVOLUTION_URL` / `WHATSAPP_EVOLUTION_API_KEY` no se manda nada.
 * 3. Timeout para que una Evolution colgada no cuelgue el endpoint.
 */

export type AvisoWhatsApp = {
  /** Número con código de país, p. ej. "528116044697" (se le añade @s.whatsapp.net). */
  phone: string;
  text: string;
};

export async function enviarAvisoPorWhatsApp(aviso: AvisoWhatsApp): Promise<void> {
  const baseUrl = process.env.WHATSAPP_EVOLUTION_URL;
  const apiKey = process.env.WHATSAPP_EVOLUTION_API_KEY;
  const instance = process.env.WHATSAPP_EVOLUTION_INSTANCE ?? "tienda";
  if (!baseUrl || !apiKey) {
    console.warn("[whatsapp-aviso] Evolution no configurada; se omite el aviso.");
    return;
  }

  const number = aviso.phone.includes("@") ? aviso.phone : `${aviso.phone}@s.whatsapp.net`;
  const url = `${baseUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number, text: aviso.text }),
      signal: ac.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        `[whatsapp-aviso] Evolution respondió ${response.status} al avisar a ${aviso.phone}: ${body.slice(0, 200)}`
      );
    }
  } catch (error) {
    console.error(
      `[whatsapp-aviso] no se pudo enviar el aviso a ${aviso.phone}: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timer);
  }
}
