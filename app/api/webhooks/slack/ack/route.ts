import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateSlackOpsMessageReviewed, verifySlackOpsAckToken } from "@/lib/slack-ops";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Confirmación de una alerta de operación desde el enlace firmado de Slack.
 *
 * ⚠️ **EL `GET` NO CAMBIA NADA, y antes sí lo hacía.** Abrir el enlace creaba el
 * registro de auditoría y actualizaba el mensaje de Slack. Cualquier acceso
 * automático lo marcaba como revisado sin que nadie lo hubiera revisado:
 *
 *   - Slack previsualiza los enlaces que se publican (unfurl).
 *   - Un antivirus de correo o una extensión de seguridad abren los enlaces
 *     para comprobarlos.
 *   - El navegador puede precargar un enlace antes de que se pulse.
 *
 * Ninguno de esos es una persona decidiendo que la alerta está atendida. Ahora
 * el `GET` solo pinta una pantalla con un botón, y el botón manda un `POST`.
 *
 * ⚠️ **La identidad NO se inventa.** El token firmado demuestra que la alerta
 * salió de Clarvex, no QUIÉN pulsó: cualquiera con la URL puede mandarla. Se
 * registra como identidad no verificada, y así queda en la auditoría. Poner un
 * nombre ahí sería peor que no ponerlo.
 *
 * Los enlaces ya publicados siguen funcionando: llevan al mismo sitio y solo
 * añaden un clic.
 */

function pagina(titulo: string, cuerpo: string, extra = "", status = 200) {
  return new Response(
    `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${titulo}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
      main { width: min(92vw, 520px); border: 1px solid #e2e8f0; border-radius: 16px; background: white; padding: 28px; box-shadow: 0 24px 50px -36px rgba(15, 23, 42, 0.65); }
      h1 { margin: 0 0 8px; font-size: 22px; line-height: 1.2; }
      p { margin: 0 0 18px; color: #334155; line-height: 1.55; }
      button { width: 100%; padding: 14px 18px; border: 0; border-radius: 12px; background: #2563eb; color: white; font-size: 15px; font-weight: 700; cursor: pointer; }
      button:hover { background: #1d4ed8; }
      .nota { margin: 14px 0 0; font-size: 13px; color: #475569; }
    </style>
  </head>
  <body>
    <main>
      <h1>${titulo}</h1>
      <p>${cuerpo}</p>
      ${extra}
    </main>
  </body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Ni cachear ni indexar: la URL lleva un token firmado.
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow"
      }
    }
  );
}

/** Escapa lo que va al HTML. El token viene de la URL: no se pinta sin escapar. */
function escapar(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Enseña la confirmación. NO toca nada.
 *
 * Es seguro para cualquier acceso automático: lo peor que puede hacer un robot
 * es ver una página.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const payload = verifySlackOpsAckToken(token);

  if (!payload || !token) {
    return pagina("Enlace vencido", "Este botón ya no es válido o no fue firmado por Clarvex.", "", 401);
  }

  // Si ya está confirmada, se dice y no se ofrece el botón: repetirlo no
  // cambiaría nada, pero enseñar un botón que no hace nada confunde.
  const yaEstaba = await prisma.auditLog.findFirst({
    where: { action: "slack.ops.ack", entity: payload.entity, entityId: payload.entityId },
    select: { createdAt: true }
  });

  if (yaEstaba) {
    return pagina(
      "Ya estaba revisada",
      `Esta alerta se marcó como revisada el ${yaEstaba.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC.`
    );
  }

  const formulario = `<form method="POST" action="/api/webhooks/slack/ack">
        <input type="hidden" name="token" value="${escapar(token)}" />
        <button type="submit">Marcar como revisada</button>
      </form>
      <p class="nota">Queda registrado en la auditoría. La identidad de quien pulsa no se puede verificar desde este enlace, así que se anota como tal.</p>`;

  return pagina("¿Marcar esta alerta como revisada?", escapar(payload.title ?? "Alerta de operación"), formulario);
}

/**
 * Aplica la confirmación. Es lo único que cambia estado.
 *
 * ⚠️ **Idempotente de verdad, no por comprobar antes.** Mirar si existe y
 * después insertar deja una carrera: dos peticiones a la vez pasan las dos la
 * comprobación y crean dos registros. Se hace en una transacción
 * `Serializable`, así que la segunda choca y se trata como «ya estaba».
 */
export async function POST(request: Request) {
  let token: string | null = null;

  const tipo = request.headers.get("content-type") ?? "";
  if (tipo.includes("application/json")) {
    const cuerpo = (await request.json().catch(() => ({}))) as { token?: string };
    token = cuerpo.token ?? null;
  } else {
    const formulario = await request.formData().catch(() => null);
    token = (formulario?.get("token") as string | null) ?? null;
  }
  // Se acepta también por query, para no romper una integración que ya la use.
  token = token ?? new URL(request.url).searchParams.get("token");

  const payload = verifySlackOpsAckToken(token);
  if (!payload) {
    return pagina("Enlace vencido", "Este botón ya no es válido o no fue firmado por Clarvex.", "", 401);
  }

  let recienCreado = false;
  try {
    await prisma.$transaction(
      async (tx) => {
        const existe = await tx.auditLog.findFirst({
          where: { action: "slack.ops.ack", entity: payload.entity, entityId: payload.entityId },
          select: { id: true }
        });
        if (existe) return;

        await tx.auditLog.create({
          data: {
            /*
             * ⚠️ La identidad NO se inventa. El token demuestra que la alerta es
             * nuestra, no quién la pulsó: cualquiera con la URL puede mandarla.
             * Que la auditoría lo diga es lo único honesto.
             */
            actorName: "Enlace firmado de Slack (identidad no verificada)",
            action: "slack.ops.ack",
            entity: payload.entity,
            entityId: payload.entityId,
            detail: JSON.stringify({
              title: payload.title,
              source: payload.source,
              createdAt: payload.createdAt,
              channelId: payload.channel,
              messageTs: payload.messageTs,
              mode: "signed-url-post",
              actorVerificado: false
            })
          }
        });
        recienCreado = true;
      },
      { isolationLevel: "Serializable" }
    );
  } catch (error) {
    // Una colisión de serialización significa que otra petición hizo lo mismo a
    // la vez. Es exactamente el resultado que se quería: ya está registrada.
    const detalle = error instanceof Error ? error.message : String(error);
    console.warn(`[slack-ack] transaccion no aplicada (probable carrera): ${detalle}`);
  }

  const actualizado = await updateSlackOpsMessageReviewed(payload);
  if (!actualizado.ok) {
    console.warn(`[slack-ack] no se pudo actualizar el mensaje: ${actualizado.problema}`);
    return pagina("Revisado", "La alerta quedó registrada, pero Slack no permitió actualizar el mensaje original.");
  }

  return pagina(
    "Revisado",
    recienCreado
      ? "La alerta quedó registrada y el mensaje de Slack ya debe aparecer marcado como revisado."
      : "Esta alerta ya estaba registrada. El mensaje de Slack quedó al día."
  );
}

/** Cualquier otro método no aplica. */
export async function PUT() {
  return NextResponse.json({ error: "Metodo no permitido." }, { status: 405 });
}
