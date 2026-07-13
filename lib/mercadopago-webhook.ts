import crypto from "node:crypto";

type MpWebhookEnv = {
  secret?: string;
  nodeEnv?: string;
};

// Verificación de firma de Mercado Pago (defensa en profundidad; la fuente de
// verdad sigue siendo el re-fetch del pago). Manifest:
// id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// En producción el secreto es obligatorio (fail-closed).
export function verifyMpSignature(request: Request, dataId: string, env: MpWebhookEnv = {}): boolean {
  const secret = env.secret ?? process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const nodeEnv = env.nodeEnv ?? process.env.NODE_ENV;
  if (!secret) {
    if (nodeEnv === "production") return false;
    return true; // solo en desarrollo/local sin secreto configurado
  }
  const signature = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(
    signature
      .split(",")
      .map((kv) => kv.split("=").map((s) => s.trim()))
      .filter((p) => p.length === 2)
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}
