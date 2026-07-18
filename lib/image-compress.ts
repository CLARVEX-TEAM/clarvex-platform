/**
 * Compresión de fotos en el CLIENTE antes de subirlas.
 *
 * Por qué: la cámara de un celular saca fotos de 4–8 MB. Subirlas crudas:
 *  - las corta Nginx (límite de cuerpo) → la subida falla sin explicación
 *    ("Failed to fetch"), que es justo lo que pasaba en el celular de la tienda;
 *  - rebasan el tope de validación del servidor (5 MB) → 400.
 *
 * Se reescala a un lado máximo razonable y se recomprime a JPEG. Una evidencia no
 * necesita 12 MP para verse bien. Si algo falla, se devuelve el archivo original:
 * nunca dejamos al usuario sin poder subir por culpa de la compresión.
 */

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen.")); };
    img.src = url;
  });
}

/**
 * Devuelve la foto reescalada/recomprimida como JPEG. Ante cualquier problema,
 * regresa el `file` original.
 */
export async function compressImage(file: File, maxDim = 2200, quality = 0.85): Promise<Blob> {
  // Ya es chica y en formato subible → no se toca.
  if (file.size < 900_000 && file.type === "image/jpeg") return file;
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    // Solo vale la pena si de verdad quedó más chica.
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
