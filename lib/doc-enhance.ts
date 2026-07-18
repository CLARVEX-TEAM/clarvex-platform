/**
 * Realce de documento escaneado (el "quitar el fondo" tipo CamScanner), en el
 * cliente, sin librerías pesadas.
 *
 * Qué hace:
 *  1. Reduce la foto a un tamaño razonable (los documentos no necesitan 12 MP;
 *     además así la subida no pesa 10 MB ni la corta Nginx).
 *  2. Escala de grises.
 *  3. Normaliza la iluminación por división contra la media local (integral
 *     image): el FONDO se va a BLANCO y el texto queda oscuro, aunque la foto
 *     tenga sombras o luz despareja.
 *
 * Se usa normalización por división (no umbral duro) a propósito: preserva el
 * texto tenue —como el de los vouchers térmicos— que un blanco/negro tajante
 * borraría.
 */

const MAX_DIMENSION = 2400;

/** Media local con imagen integral (box blur O(n)). */
function localMeanDivide(gray: Float32Array, width: number, height: number): void {
  // Ventana relativa al documento: ni tan chica que "coma" el texto, ni tan grande
  // que no normalice las sombras.
  const radius = Math.max(12, Math.floor(Math.min(width, height) / 24));

  // Imagen integral (suma acumulada) con padding de 1 para simplificar los bordes.
  const iw = width + 1;
  const integral = new Float64Array(iw * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * iw + (x + 1)] = integral[y * iw + (x + 1)] + rowSum;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const count = (y1 - y0 + 1) * (x1 - x0 + 1);
      const sum = integral[(y1 + 1) * iw + (x1 + 1)]
        - integral[y0 * iw + (x1 + 1)]
        - integral[(y1 + 1) * iw + x0]
        + integral[y0 * iw + x0];
      const mean = sum / count;
      // ratio ≈ 1 en el fondo (→ blanco); < 1 en el texto (→ oscuro).
      // El +8 evita divisiones inestables en zonas muy oscuras.
      const value = gray[y * width + x];
      let out = (value / (mean + 8)) * 255;
      // Contraste suave: asienta el texto sin comerse lo tenue del voucher térmico.
      out = (out - 128) * 1.08 + 128;
      // Limpieza de altas luces: lo casi-blanco se fija a blanco puro. Quita el
      // GRANO del papel (la causa de que se vieran sucios) sin tocar el texto,
      // que en un corte/voucher siempre queda muy por debajo de 220.
      if (out > 220) out = 255;
      gray[y * width + x] = out < 0 ? 0 : out > 255 ? 255 : out;
    }
  }
}

/**
 * Blanquea el fondo de un ImageData EN SITIO: escala de grises + normalización de
 * iluminación. Se usa tanto en la foto completa como en el documento ya enderezado.
 */
export function whiten(image: ImageData): void {
  const { width, height, data } = image;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  localMeanDivide(gray, width, height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const v = gray[p];
    data[i] = v; data[i + 1] = v; data[i + 2] = v;
  }
}

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
 * Devuelve el documento realzado como JPEG. Si algo falla (canvas no disponible,
 * imagen rara), regresa el archivo original: nunca deja al usuario sin escanear.
 */
export async function enhanceDocument(file: File): Promise<Blob> {
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const image = ctx.getImageData(0, 0, width, height);
    whiten(image);
    ctx.putImageData(image, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    return blob ?? file;
  } catch {
    return file; // ante cualquier problema, la foto original
  }
}
