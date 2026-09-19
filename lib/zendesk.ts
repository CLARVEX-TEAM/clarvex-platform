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

/* ────────────────────────────────────────────────────────────────────────────
 * Leer y contestar un caso.
 *
 * ⚠️ **Zendesk es el DUEÑO del caso.** El estado, la conversación y el tiempo de
 * atención se leen de ahí en cada consulta; Clarvex solo guarda a quién
 * pertenece el caso, que es lo que Zendesk no puede decidir por nosotros.
 * ──────────────────────────────────────────────────────────────────────────── */

type Peticion = { ruta: string; metodo?: string; cuerpo?: unknown; ms?: number };

async function zendesk<T>(p: Peticion): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (!ZENDESK_ENABLED) return { ok: false, error: "Zendesk no está configurado." };
  const auth = Buffer.from(`${email}/token:${apiToken}`).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), p.ms ?? 10_000);
  try {
    const res = await fetch(`https://${subdomain}.zendesk.com${p.ruta}`, {
      method: p.metodo ?? "GET",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      ...(p.cuerpo === undefined ? {} : { body: JSON.stringify(p.cuerpo) }),
      signal: controller.signal
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      console.error("[zendesk]", p.metodo ?? "GET", p.ruta, "->", res.status, detalle.slice(0, 300));
      /*
       * ⚠️ 429 se distingue del resto. Zendesk limita peticiones por minuto y
       * tratarlo como «no existe» haría desaparecer un caso de la pantalla de
       * quien lo abrió justo cuando más lo mira.
       */
      return { ok: false, error: res.status === 429 ? "limite" : `estado-${res.status}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (error) {
    console.error("[zendesk] sin contacto:", (error as Error).message);
    return { ok: false, error: "sin-contacto" };
  } finally {
    clearTimeout(timeout);
  }
}

export type TicketZendesk = {
  id: number;
  status?: string;
  subject?: string;
  requester_id?: number;
  created_at?: string;
};

export async function leerTicket(id: number): Promise<TicketZendesk | null> {
  const r = await zendesk<{ ticket?: TicketZendesk }>({ ruta: `/api/v2/tickets/${id}.json` });
  return r.ok ? r.data.ticket ?? null : null;
}

export type ComentarioZendesk = {
  public?: boolean;
  body?: string;
  created_at?: string;
  author_id?: number;
};

export async function leerComentarios(id: number): Promise<ComentarioZendesk[] | null> {
  // 100 comentarios es mucho más de lo que dura un caso de tienda; sin paginar.
  const r = await zendesk<{ comments?: ComentarioZendesk[] }>({
    ruta: `/api/v2/tickets/${id}/comments.json?per_page=100`
  });
  return r.ok ? r.data.comments ?? [] : null;
}

/**
 * Publica la respuesta de quien abrió el caso.
 *
 * ⚠️ **Va como comentario PÚBLICO.** Uno interno lo verían solo los agentes y
 * quien escribió se quedaría esperando una respuesta a algo que nadie le
 * contestó, sin forma de notar que su mensaje no llegó a ninguna parte.
 */
export async function responderTicket(id: number, texto: string): Promise<boolean> {
  const r = await zendesk({
    ruta: `/api/v2/tickets/${id}.json`,
    metodo: "PUT",
    cuerpo: { ticket: { comment: { body: texto, public: true } } }
  });
  return r.ok;
}

/**
 * La id de nuestra propia cuenta de API en Zendesk.
 *
 * ⚠️ Hace falta para saber qué mensajes son de la persona: quien tiene el correo
 * inventado `@clarvex.local` no existe en Zendesk, así que lo suyo se publica a
 * nombre de esta cuenta. Sin esto, su conversación se pintaría al revés.
 *
 * Se cachea por proceso: no cambia, y es una petición por caso abierto.
 */
let cuentaPropia: number | null | undefined;
export async function idDeNuestraCuenta(): Promise<number | null> {
  if (cuentaPropia !== undefined) return cuentaPropia;
  const r = await zendesk<{ user?: { id?: number } }>({ ruta: "/api/v2/users/me.json" });
  cuentaPropia = r.ok ? r.data.user?.id ?? null : null;
  return cuentaPropia;
}
