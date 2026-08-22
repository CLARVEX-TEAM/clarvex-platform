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
  /** URL firmada del archivo. Vive lo suficiente para que n8n reintente. */
  imageUrl: string;
  fileName: string | null;
  createdAt: string;
  /**
   * "photo" (default) → Telegram sendPhoto. "document" → sendDocument (para el
   * PDF de los escaneos del cierre). n8n hace un Switch sobre este campo.
   */
  format?: "photo" | "document";
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

/**
 * Aviso de operación hacia el mismo n8n: texto, sin foto.
 *
 * Nace para la auditoría del kardex, que corre de madrugada por cron: un
 * registro que nadie lee no es una alarma. Esto sí llega al teléfono.
 *
 * ⚠️ **NO usa la lista `WEBHOOK_STORE_IDS`.** Esa lista existe para que las
 * FOTOS de una tienda no acaben en el canal de otra, y es un filtro por tienda.
 * Un aviso de operación no es de una tienda: es del sistema, y va a quien
 * administra. Filtrarlo por tienda lo dejaría mudo justo donde importa —el día
 * que una tienda sin webhook tenga el problema.
 *
 * Igual de silencioso ante fallos que el de fotos: un n8n caído no puede hacer
 * que la auditoría reporte éxito ni que reviente.
 */
export type OpsAlertPayload = {
  /** n8n bifurca por aquí: `alert` va a `sendMessage`, no a `sendPhoto`. */
  format: "alert";
  /** Qué lo produjo, para poder enrutar o filtrar después. */
  source: string;
  title: string;
  /** Ya viene armado y listo para leerse en el teléfono. */
  text: string;
  createdAt: string;
};

export async function sendOpsAlert(payload: Omit<OpsAlertPayload, "format" | "createdAt">): Promise<void> {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.WEBHOOK_SECRET ? { "X-Clarvex-Secret": process.env.WEBHOOK_SECRET } : {})
      },
      body: JSON.stringify({
        ...payload,
        format: "alert" as const,
        createdAt: new Date().toISOString()
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
  } catch {
    // Silencio a propósito: el aviso es un extra, no la comprobación.
  }
}
