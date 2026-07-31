/**
 * Envío de correo transaccional por Resend.
 *
 * Va por `fetch` y no por el SDK a propósito: la API de Resend es un POST a un
 * endpoint, y una dependencia más es una versión más que mantener. Es el mismo
 * criterio de `lib/webhooks.ts`.
 *
 * Diferencia importante con los webhooks: aquí NO es fire-and-forget. El correo
 * de restablecimiento es la única vía de entrada de esa persona, así que el
 * llamador necesita saber si falló para registrarlo. Lo que nunca hacemos es
 * contárselo al usuario final — ver el comentario sobre enumeración en
 * `app/api/auth/pin-reset/request/route.ts`.
 */

const TIMEOUT_MS = 10_000;
const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Dominio de los correos que la app se inventa al dar de alta a alguien
 * (`app/api/team/route.ts`). NO existe: nada enviado ahí llega a ningún lado.
 * Vive aquí para que haya un único sitio donde cambiarlo.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = "clarvex.local";

/**
 * ¿Este correo es una dirección real o el relleno que puso la app?
 *
 * Un `@clarvex.local` cuenta como "sin correo": mandarle un enlace de acceso es
 * tirarlo a la basura, y peor, hacerle creer al usuario que le llegó algo.
 */
export function hasRealEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const value = email.trim().toLowerCase();
  if (!value.includes("@")) return false;
  return !value.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

/** Remitente configurado. Sin él no se manda nada (ver `emailEnabled`). */
function fromAddress(): string | null {
  const from = process.env.RESEND_FROM?.trim();
  return from ? from : null;
}

/**
 * ¿Está el correo configurado? Si falta cualquiera de las dos variables, la app
 * sigue funcionando: simplemente no ofrece el restablecimiento por correo. Un
 * despliegue sin configurar no debe romper el login.
 */
export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && fromAddress());
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  /** Alternativa en texto plano. Obligatoria: mejora la entrega y algunos clientes no pintan HTML. */
  text: string;
};

export type SendEmailResult = { ok: true; id: string | null } | { ok: false; error: string };

export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = fromAddress();
  if (!apiKey || !from) return { ok: false, error: "Correo no configurado (falta RESEND_API_KEY o RESEND_FROM)." };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: controller.signal
    });
    if (!response.ok) {
      // El cuerpo de Resend trae el motivo (dominio sin verificar, destinatario
      // invalido...). Se registra para poder diagnosticar, nunca se le devuelve
      // al usuario final.
      const detail = await response.text().catch(() => "");
      return { ok: false, error: `Resend respondio ${response.status}: ${detail.slice(0, 300)}` };
    }
    const payload = (await response.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: payload?.id ?? null };
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "timeout" : String(error);
    return { ok: false, error: `No se pudo contactar a Resend: ${reason}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * URL pública de la app, para armar enlaces absolutos en los correos.
 *
 * Reutiliza `WEBAUTHN_ORIGIN` como respaldo porque ya es exactamente eso (el
 * origen público) y así un despliegue existente no necesita una variable más.
 */
export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim() || process.env.WEBAUTHN_ORIGIN?.trim();
  return (explicit || "http://localhost:3000").replace(/\/+$/, "");
}
