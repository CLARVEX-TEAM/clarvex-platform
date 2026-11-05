/**
 * Envío de comunicados a WhatsApp (Evolution API → grupo de la tienda).
 *
 * Reglas duras (mismas que lib/webhooks.ts):
 *
 * 1. FIRE-AND-FORGET. Nunca lanza. Si Evolution/n8n está caído, el comunicado se
 *    publica igual: no se rompe una operación real de la tienda por un aviso.
 *
 * 2. Filtra por TIENDA. Con la app multi-tienda, un comunicado de una tienda NO
 *    puede acabar en el grupo de otra. Sin `WHATSAPP_ANNOUNCE_STORE_IDS` no se
 *    manda nada — opt-in explícito.
 *
 * 3. Tiene timeout. Una Evolution colgada no puede dejar colgada la publicación.
 */

const EVOLUTION_URL = () => process.env.WHATSAPP_EVOLUTION_URL?.replace(/\/$/, "") ?? "";
const EVOLUTION_INSTANCE = () => process.env.WHATSAPP_EVOLUTION_INSTANCE ?? "";
const EVOLUTION_API_KEY = () => process.env.WHATSAPP_EVOLUTION_API_KEY ?? "";
const GROUP_JID = () => process.env.WHATSAPP_ANNOUNCE_GROUP_JID ?? "";

/** Tiendas cuyos comunicados también van a WhatsApp. CSV: "id1,id2". Vacío = nadie. */
function tiendaHabilitada(storeId: string): boolean {
  const lista = (process.env.WHATSAPP_ANNOUNCE_STORE_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return lista.includes(storeId);
}

function configurado(storeId: string): boolean {
  return Boolean(
    EVOLUTION_URL() && EVOLUTION_INSTANCE() && EVOLUTION_API_KEY() && GROUP_JID() && tiendaHabilitada(storeId)
  );
}

async function post(ruta: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    await fetch(`${EVOLUTION_URL()}${ruta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY() },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Manda el comunicado al grupo de WhatsApp de su tienda. Con imagen si lleva
 * (la app guarda la clave R2 en imageUrl; la convertimos a URL firmada legible).
 * Silencioso ante cualquier fallo: es un extra, no la operación.
 */
export async function enviarComunicadoAWhatsApp(params: {
  storeId: string;
  title: string;
  body: string;
  /** URL de la imagen ya firmada (legible públicamente), o null. */
  imageUrl?: string | null;
}): Promise<void> {
  try {
    if (!configurado(params.storeId)) return;
    const texto = `📢 *${params.title}*\n${params.body}`.trim();
    if (params.imageUrl) {
      await post(`/message/sendMedia/${EVOLUTION_INSTANCE()}`, {
        number: GROUP_JID(),
        mediatype: "image",
        mimetype: "image/jpeg",
        caption: texto,
        media: params.imageUrl
      });
    } else {
      await post(`/message/sendText/${EVOLUTION_INSTANCE()}`, {
        number: GROUP_JID(),
        text: texto
      });
    }
  } catch {
    // Silencio a propósito: el aviso a WhatsApp es un extra, no la comprobación.
  }
}
