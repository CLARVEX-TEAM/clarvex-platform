/**
 * Valida cuerpos especiales del chat ([img:…], [gif:…], [sticker:…]) para
 * evitar que un miembro embeba hosts arbitrarios (tracking pixels / malware).
 *
 * Imágenes: solo el proxy autenticado `/api/chat/file?k=…`.
 * GIFs: solo hosts de Klipy (CDN).
 * Stickers: ids alfanuméricos del catálogo local.
 */

const IMG_PROXY = /^\[img:(\/api\/chat\/file\?k=[^\]]+)\]$/;
const GIF_MSG = /^\[gif:(https:\/\/[^\]]+)\]$/;
const STICKER_MSG = /^\[sticker:([a-z_]+)\]$/;

function isAllowedGifHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "klipy.com" || host.endsWith(".klipy.com");
}

export function isAllowedChatMediaBody(body: string): boolean {
  const img = IMG_PROXY.exec(body);
  if (img) {
    try {
      const url = new URL(img[1], "https://clarvex.local");
      if (url.pathname !== "/api/chat/file") return false;
      const key = url.searchParams.get("k");
      return Boolean(key && key.length > 0 && key.length <= 500 && !key.includes(".."));
    } catch {
      return false;
    }
  }

  const gif = GIF_MSG.exec(body);
  if (gif) {
    try {
      const url = new URL(gif[1]);
      if (url.protocol !== "https:") return false;
      return isAllowedGifHost(url.hostname);
    } catch {
      return false;
    }
  }

  if (STICKER_MSG.test(body)) return true;

  // Texto plano: no es media embebida.
  return !/^\[(img|gif|sticker):/i.test(body);
}

export function chatMediaRejectionMessage(): string {
  return "Solo se permiten imágenes del chat o GIFs de Klipy.";
}
