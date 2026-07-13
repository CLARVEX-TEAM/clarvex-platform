/**
 * Convierte la foto de perfil guardada en la BD (una URL pública de R2) en la
 * URL del proxy autenticado `/api/files/photo`.
 *
 * Se aplica en el CLIENTE, al renderizar, para no tener que migrar la base de
 * datos ni tocar las ~15 rutas que devuelven `photoUrl`.
 *
 * Deja pasar sin tocar:
 * - URLs firmadas (apuntan a `*.r2.cloudflarestorage.com`, ya traen su permiso)
 * - `data:` URIs (perfiles cacheados del lock de escritorio)
 * - rutas relativas (ya convertidas) y enlaces externos
 *
 * Nota: el bucket público de Clarvex vive en `*.r2.dev` (ver R2_PUBLIC_URL). Si
 * algún día se migra a un dominio propio, hay que añadirlo aquí — el peor caso
 * es que la foto siga sirviéndose por la URL pública, nunca que se rompa.
 */
export function photoSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith("http")) return url; // relativa o data:
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!parsed.hostname.endsWith(".r2.dev")) return url; // firmada o externa
  const key = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
  if (!key || key.includes("..")) return url;
  return `/api/files/photo?k=${encodeURIComponent(key)}`;
}
