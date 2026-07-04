// IP del cliente resistente a suplantación, para el rate limit por IP.
//
// Detrás de Cloudflare + Nginx Proxy Manager, el proxy de confianza SOBRESCRIBE
// `cf-connecting-ip` y `x-real-ip`, así que son fiables. En cambio, el PRIMER
// valor de `x-forwarded-for` lo puede fijar el propio cliente (nginx solo AÑADE
// el remote_addr real al FINAL de la cadena), por lo que tomarlo como IP era
// spoofeable: un atacante ponía una IP distinta en cada intento y evadía el
// límite. Aquí se prefieren los headers que pone el proxy y, como último
// recurso, se toma el ÚLTIMO segmento de XFF (el que añadió el proxy), no el
// primero.
export function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}
