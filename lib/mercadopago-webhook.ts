import crypto from "node:crypto";

type MpWebhookEnv = {
  secret?: string;
  nodeEnv?: string;
};

/**
 * Por qué esto devuelve un motivo y no un booleano.
 *
 * Los dos «no» que puede dar esta función significan cosas OPUESTAS:
 *
 * - `sin-secreto` es un error NUESTRO de configuración. Todos los pagos se
 *   rechazan, incluidos los buenos, y nadie se entera hasta que un cliente
 *   reclama que pagó y su tienda sigue vencida.
 * - `no-coincide` es la defensa haciendo su trabajo: alguien firmó mal.
 *
 * Con un booleano los dos casos escribían la misma línea en el log
 * («firma inválida»), que es justo la que hace pensar en un atacante y NO en
 * un `.env` incompleto. Costó meses de webhooks caídos sin que saltara nada.
 */
export type MpSignatureCheck =
  | { ok: true }
  | { ok: false; reason: "sin-secreto" | "sin-firma" | "no-coincide" };

// Verificación de firma de Mercado Pago (defensa en profundidad; la fuente de
// verdad sigue siendo el re-fetch del pago). Manifest:
// id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// En producción el secreto es obligatorio (fail-closed).
export function verifyMpSignature(request: Request, dataId: string, env: MpWebhookEnv = {}): MpSignatureCheck {
  const secret = env.secret ?? process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const nodeEnv = env.nodeEnv ?? process.env.NODE_ENV;
  if (!secret) {
    if (nodeEnv === "production") return { ok: false, reason: "sin-secreto" };
    return { ok: true }; // solo en desarrollo/local sin secreto configurado
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
  if (!ts || !v1) return { ok: false, reason: "sin-firma" };
  // Mercado Pago arma el manifiesto con el id en minúsculas cuando es
  // alfanumérico. Los pagos traen id numérico, así que hoy no cambia nada, pero
  // otros temas (merchant_order) sí lo traen con letras.
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
      ? { ok: true }
      : { ok: false, reason: "no-coincide" };
  } catch {
    return { ok: false, reason: "no-coincide" };
  }
}
