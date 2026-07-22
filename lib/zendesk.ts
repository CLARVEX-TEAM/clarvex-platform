// Integración con Zendesk: crea tickets de soporte vía la API REST desde el
// SERVIDOR. No carga scripts externos, así que respeta el CSP estricto de la app
// y funciona igual en la PWA. Si Zendesk no está configurado o falla, se informa
// al usuario sin tumbar nada.
//
// Auth de Zendesk (Basic): base64("<email>/token:<api_token>").
// Variables: ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN.

const subdomain = process.env.ZENDESK_SUBDOMAIN?.trim() ?? "";
const email = process.env.ZENDESK_EMAIL?.trim() ?? "";
const apiToken = process.env.ZENDESK_API_TOKEN?.trim() ?? "";

/** Solo se puede crear tickets si están las 3 variables. */
export const ZENDESK_ENABLED = Boolean(subdomain && email && apiToken);

export type ZendeskTicketInput = {
  subject: string;
  body: string;
  requesterName: string;
  /** Correo del reportante. Solo se envía como requester si parece un email real. */
  requesterEmail?: string | null;
  tags?: string[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ZendeskResult = { ok: boolean; id?: number; error?: string };

export async function createZendeskTicket(input: ZendeskTicketInput): Promise<ZendeskResult> {
  if (!ZENDESK_ENABLED) return { ok: false, error: "Zendesk no está configurado." };

  const auth = Buffer.from(`${email}/token:${apiToken}`).toString("base64");
  const url = `https://${subdomain}.zendesk.com/api/v2/tickets.json`;

  // Solo asociamos un requester con email cuando el correo del empleado parece
  // real; si es un placeholder, se omite y la identidad queda en el cuerpo.
  const requester = input.requesterEmail && EMAIL_RE.test(input.requesterEmail)
    ? { name: input.requesterName, email: input.requesterEmail }
    : undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        ticket: {
          subject: input.subject,
          comment: { body: input.body },
          ...(requester ? { requester } : {}),
          tags: input.tags ?? ["clarvex-app"]
        }
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[zendesk] Error creando ticket — status:", res.status, "body:", detail.slice(0, 300));
      return { ok: false, error: `Zendesk respondió ${res.status}` };
    }
    const data = (await res.json()) as { ticket?: { id?: number } };
    return { ok: true, id: data.ticket?.id };
  } catch (error) {
    console.error("[zendesk] No se pudo contactar a Zendesk:", (error as Error).message);
    return { ok: false, error: "No se pudo contactar a Zendesk." };
  } finally {
    clearTimeout(timeout);
  }
}
