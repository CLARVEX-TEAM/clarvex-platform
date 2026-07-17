/**
 * Webhook de salida hacia n8n: avisa cuando alguien sube una foto (evidencia o
 * faltante) para que llegue a un canal de Telegram.
 *
 * Reglas duras:
 *
 * 1. FIRE-AND-FORGET. Nunca lanza. Si n8n está caído, la evidencia se sube
 *    igual: no se rompe una operación real de la tienda por una notificación.
 *
 * 2. Filtra por TIENDA. Con la app siendo multi-tienda, las fotos de una tienda
 *    NO pueden acabar en el canal de otra. Sin `WEBHOOK_STORE_IDS` no se manda
 *    nada — opt-in explícito, no por descuido.
 *
 * 3. Tiene timeout. Un n8n colgado no puede dejar esperando al asesor.
 *
 * ⚠️ La foto sale de tu infraestructura: R2 es privado, pero Telegram no. Es una
 * decisión consciente del usuario, no un descuido.
 */

const TIMEOUT_MS = 5000;

export type PhotoWebhookPayload = {
  type: "evidence" | "inventory" | "checklist";
  storeId: string;
  storeName: string;
  /** Ya viene armado (ver lib/webhook-caption): n8n solo lo reenvía. */
  caption: string;
  /** URL firmada de la foto. Vive lo suficiente para que n8n reintente. */
  imageUrl: string;
  fileName: string | null;
  createdAt: string;
};

/** ¿Está configurado el webhook para esta tienda? */
function targetFor(storeId: string): string | null {
  const url = process.env.WEBHOOK_URL;
  if (!url) return null;

  const allowed = (process.env.WEBHOOK_STORE_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  // Sin lista de tiendas no se manda nada. Es a propósito: en una app
  // multi-tienda, un webhook "para todos" por defecto filtraría las fotos de una
  // tienda al canal de otra.
  if (allowed.length === 0 || !allowed.includes(storeId)) return null;
  return url;
}

/**
 * ¿Vale la pena preparar el aviso para esta tienda?
 *
 * Se consulta ANTES de armar el payload: si el webhook está apagado, no se firma
 * la URL de la foto ni se busca el nombre de la tienda. Cero trabajo de más en
 * la ruta de subida, que es la que el asesor está esperando.
 */
export function isPhotoWebhookEnabled(storeId: string): boolean {
  return targetFor(storeId) !== null;
}

export async function sendPhotoWebhook(payload: PhotoWebhookPayload): Promise<void> {
  const url = targetFor(payload.storeId);
  if (!url) return;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Para que n8n pueda rechazar cualquier POST que no venga de la app.
        ...(process.env.WEBHOOK_SECRET ? { "X-Clarvex-Secret": process.env.WEBHOOK_SECRET } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timer);
  } catch {
    // Silencio a propósito: un webhook caído NO puede romper la subida.
    // Si deja de llegar a Telegram, se nota enseguida; si se rompiera la subida,
    // sería mucho peor.
  }
}
