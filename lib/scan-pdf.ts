import { PDFDocument } from "pdf-lib";

/**
 * Junta las fotos escaneadas (corte de caja, vouchers, depósito) en UN PDF, una
 * imagen por página tamaño carta, ajustada manteniendo proporción.
 *
 * Solo JPG y PNG: pdf-lib no incrusta WEBP, y las cámaras entregan JPEG. Por eso
 * la subida del escaneo rechaza WEBP (ver la ruta de subida).
 */

const LETTER_WIDTH = 612; // 8.5" × 72pt
const LETTER_HEIGHT = 792; // 11" × 72pt
const MARGIN = 18; // ~0.25"

function isPng(bytes: Uint8Array): boolean {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

export async function buildScanPdf(images: Uint8Array[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const bytes of images) {
    const image = isPng(bytes) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);

    const maxW = LETTER_WIDTH - MARGIN * 2;
    const maxH = LETTER_HEIGHT - MARGIN * 2;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;

    page.drawImage(image, {
      x: (LETTER_WIDTH - width) / 2,
      y: (LETTER_HEIGHT - height) / 2,
      width,
      height
    });
  }
  return pdf.save();
}
