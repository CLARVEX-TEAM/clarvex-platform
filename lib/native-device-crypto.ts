import { createHash, createPublicKey, verify } from "node:crypto";

export const NATIVE_SIGNATURE_VERSION = "clarvex-native-v1";
export const NATIVE_CHALLENGE_TTL_MS = 2 * 60 * 1000;
export const NATIVE_CLOCK_SKEW_MS = 2 * 60 * 1000;

type RegistrationManifest = {
  challengeId: string;
  nonce: string;
  installationId: string;
  userId: string;
  storeId: string;
};

type RequestManifest = {
  challengeId: string;
  nonce: string;
  installationId: string;
  timestamp: string;
  method: string;
  path: string;
  bodySha256: string;
};

/** Texto exacto que firma Android al registrar por primera vez su llave. */
export function nativeRegistrationManifest(input: RegistrationManifest): string {
  return [
    NATIVE_SIGNATURE_VERSION,
    "REGISTER",
    input.challengeId,
    input.nonce,
    input.installationId,
    input.userId,
    input.storeId
  ].join("\n");
}
/** Texto exacto que firma una APK ya registrada para un endpoint exclusivo. */
export function nativeRequestManifest(input: RequestManifest): string {
  return [
    NATIVE_SIGNATURE_VERSION,
    "REQUEST",
    input.challengeId,
    input.nonce,
    input.installationId,
    input.timestamp,
    input.method.toUpperCase(),
    input.path,
    input.bodySha256.toLowerCase()
  ].join("\n");
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function strictBase64(value: string, maxBytes: number): Buffer | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0 || decoded.length > maxBytes) return null;
  return decoded.toString("base64") === value ? decoded : null;
}

/**
 * Verifica ECDSA P-256 en formato DER, que es el formato que produce
 * `SHA256withECDSA` en Android. También rechaza llaves RSA u otras curvas.
 */
export function verifyNativeSignature(publicKeyBase64: string, payload: string, signatureBase64: string): boolean {
  try {
    const publicKeyDer = strictBase64(publicKeyBase64, 1024);
    const signatureDer = strictBase64(signatureBase64, 256);
    if (!publicKeyDer || !signatureDer) return false;
    const publicKey = createPublicKey({ key: publicKeyDer, format: "der", type: "spki" });
    if (publicKey.asymmetricKeyType !== "ec") return false;
    const curve = publicKey.asymmetricKeyDetails?.namedCurve;
    if (curve !== "prime256v1" && curve !== "secp256r1") return false;
    return verify("sha256", Buffer.from(payload, "utf8"), publicKey, signatureDer);
  } catch {
    return false;
  }
}

export function nativeRequestPath(request: Request): string {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
}
