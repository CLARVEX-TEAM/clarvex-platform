// Cliente mínimo de Mercado Pago (Checkout Pro) sobre fetch, sin SDK.
// Requiere la variable de entorno MP_ACCESS_TOKEN (Access Token de producción
// de tu aplicación en Mercado Pago). Si no está configurada, billingEnabled()
// es false y los endpoints responden con un aviso claro.

const MP_API = "https://api.mercadopago.com";

export function billingEnabled(): boolean {
  return Boolean(process.env.MP_ACCESS_TOKEN);
}

function token(): string {
  const value = process.env.MP_ACCESS_TOKEN;
  if (!value) throw new Error("MP_ACCESS_TOKEN no está configurado.");
  return value;
}

export type CreatePreferenceInput = {
  storeId: string;
  storeName: string;
  amountMxn: number;
  payerEmail?: string | null;
  successUrl: string;
  failureUrl: string;
  notificationUrl: string;
};

/** Crea una preferencia de Checkout Pro y devuelve el link de pago (init_point). */
export async function createPreference(input: CreatePreferenceInput): Promise<{ id: string; initPoint: string }> {
  const body = {
    items: [{
      id: `sub-${input.storeId}`,
      title: `Suscripción Clarvex Team — ${input.storeName}`,
      quantity: 1,
      currency_id: "MXN",
      unit_price: Math.round(input.amountMxn * 100) / 100
    }],
    payer: input.payerEmail ? { email: input.payerEmail } : undefined,
    external_reference: input.storeId,
    back_urls: { success: input.successUrl, failure: input.failureUrl, pending: input.successUrl },
    auto_return: "approved",
    notification_url: input.notificationUrl,
    statement_descriptor: "CLARVEX"
  };
  const response = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Mercado Pago rechazó la preferencia (${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json() as { id: string; init_point?: string; sandbox_init_point?: string };
  const initPoint = data.init_point ?? data.sandbox_init_point;
  if (!initPoint) throw new Error("Mercado Pago no devolvió el link de pago.");
  return { id: data.id, initPoint };
}

export type MpPayment = {
  id: number;
  status: string;                 // approved | pending | rejected | ...
  transaction_amount: number;
  currency_id: string;
  external_reference: string | null;
  payment_method_id: string | null;
  payment_type_id: string | null;
  date_approved: string | null;
};

/** Consulta un pago por id para confirmar su estado real (no confiar en el webhook). */
export async function getPayment(paymentId: string): Promise<MpPayment> {
  const response = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token()}` }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`No se pudo leer el pago ${paymentId} (${response.status}): ${detail.slice(0, 200)}`);
  }
  return await response.json() as MpPayment;
}
