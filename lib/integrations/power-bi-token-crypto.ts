import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { PowerBiExportError } from "@/lib/integrations/power-bi-errors";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function deriveKey(): Buffer {
  const raw = process.env.POWER_BI_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new PowerBiExportError("POWER_BI_TOKEN_ENCRYPTION_KEY no está configurada.", {
      code: "POWER_BI_CRYPTO_NOT_CONFIGURED"
    });
  }

  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  return scryptSync(raw, "clarvex-power-bi-token", 32);
}

export function encryptPowerBiSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptPowerBiSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new PowerBiExportError("No se pudo descifrar el token de Power BI guardado.", {
      code: "POWER_BI_CRYPTO_INVALID"
    });
  }

  const [ivB64, tagB64, dataB64] = parts;
  const key = deriveKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}
