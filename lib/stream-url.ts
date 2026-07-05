// Normaliza enlaces de transmisión al formato embebible cuando lo conocemos.
// YouTube bloquea iframes en sus URLs normales (watch, live, youtu.be) pero
// permite /embed/<id>; convertimos automáticamente para que "solo funcione".
export function normalizeStreamUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    // /watch?v=ID · /live/ID · /shorts/ID → /embed/ID
    const id = url.pathname === "/watch"
      ? url.searchParams.get("v")
      : url.pathname.match(/^\/(?:live|shorts)\/([\w-]{6,})/)?.[1] ?? null;
    if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1`;
    return raw;
  }
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).match(/^[\w-]{6,}/)?.[0];
    if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1`;
    return raw;
  }
  return raw;
}

// Revisa si la respuesta de un sitio permite mostrarse dentro de un iframe.
// Bloqueado si manda X-Frame-Options o un CSP con frame-ancestors restrictivo.
export function headersAllowEmbed(headers: Headers): boolean {
  const xfo = headers.get("x-frame-options");
  if (xfo && /deny|sameorigin/i.test(xfo)) return false;
  const csp = headers.get("content-security-policy") ?? "";
  const ancestors = csp.match(/frame-ancestors\s+([^;]+)/i)?.[1]?.trim();
  if (ancestors && !ancestors.includes("*")) return false;
  return true;
}
