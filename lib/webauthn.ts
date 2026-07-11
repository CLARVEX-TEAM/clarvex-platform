// En producción exigimos configuración explícita de WebAuthn: los defaults de
// localhost solo valen en desarrollo. Falla ruidoso si falta en producción para
// evitar un binding de origen/RP incorrecto.
if (process.env.NODE_ENV === "production") {
  const missing = ["WEBAUTHN_RP_ID", "WEBAUTHN_ORIGIN"].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Configura ${missing.join(", ")} en producción para la biometría (WebAuthn).`);
  }
}

export const RP_ID = process.env.WEBAUTHN_RP_ID ?? "localhost";
export const RP_NAME = process.env.WEBAUTHN_RP_NAME ?? "Clarvex Team";
export const ORIGIN = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000";
