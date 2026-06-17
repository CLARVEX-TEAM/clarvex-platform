// Reduce/recomprime una imagen en el navegador antes de subirla: más rápido y
// evita rechazos por tamaño. Si algo falla, devuelve el archivo original.

export async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const largest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxDim / largest);
    // Ya es chica y ligera → no vale la pena recomprimir.
    if (scale === 1 && file.size < 900_000) { bitmap.close?.(); return file; }

    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close?.(); return file; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // si no mejora, deja el original
    const name = file.name.replace(/\.(heic|heif|png|webp|jpeg|jpg)$/i, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
