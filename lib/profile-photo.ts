export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const allowedImages = {
  "image/jpeg": { extension: "jpg", signatures: [[0xff, 0xd8, 0xff]] },
  "image/png": { extension: "png", signatures: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
  "image/webp": { extension: "webp", signatures: [[0x52, 0x49, 0x46, 0x46]] }
} as const;

export function validateProfilePhoto(file: { type: string; size: number }, bytes: Uint8Array) {
  const image = allowedImages[file.type as keyof typeof allowedImages];
  if (!image) return { valid: false as const, error: "Usa una imagen JPG, PNG o WEBP." };
  if (file.size <= 0 || file.size > PROFILE_PHOTO_MAX_BYTES) return { valid: false as const, error: "La imagen debe pesar menos de 5 MB." };
  const matchesSignature = image.signatures.some((signature) => signature.every((byte, index) => bytes[index] === byte));
  const isWebp = file.type !== "image/webp" || (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50);
  if (!matchesSignature || !isWebp) return { valid: false as const, error: "El archivo no contiene una imagen valida." };
  return { valid: true as const, extension: image.extension };
}
