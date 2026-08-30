import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateSlackOpsMessageReviewed, verifySlackOpsAckToken } from "@/lib/slack-ops";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function html(title: string, body: string, status = 200) {
  return new Response(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
      main { width: min(92vw, 520px); border: 1px solid #e2e8f0; border-radius: 16px; background: white; padding: 28px; box-shadow: 0 24px 50px -36px rgba(15, 23, 42, 0.65); }
      h1 { margin: 0 0 8px; font-size: 22px; line-height: 1.2; }
      p { margin: 0; color: #475569; line-height: 1.55; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${body}</p>
    </main>
  </body>
</html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const payload = verifySlackOpsAckToken(url.searchParams.get("token"));
  if (!payload) {
    return html("Enlace vencido", "Este botón ya no es válido o no fue firmado por Clarvex.", 401);
  }

  const existing = await prisma.auditLog.findFirst({
    where: {
      action: "slack.ops.ack",
      entity: payload.entity,
      entityId: payload.entityId
    },
    select: { id: true }
  });

  if (!existing) {
    await prisma.auditLog.create({
      data: {
        actorName: "Slack enlace firmado",
        action: "slack.ops.ack",
        entity: payload.entity,
        entityId: payload.entityId,
        detail: JSON.stringify({
          title: payload.title,
          source: payload.source,
          createdAt: payload.createdAt,
          channelId: payload.channel,
          messageTs: payload.messageTs,
          mode: "signed-url"
        })
      }
    });
  }

  const updated = await updateSlackOpsMessageReviewed(payload);
  if (!updated.ok) {
    console.warn(`[slack-actions] no se pudo actualizar mensaje revisado: ${updated.problema}`);
    return html("Revisado", "La alerta quedó registrada, pero Slack no permitió actualizar el mensaje original.");
  }

  return html("Revisado", "La alerta quedó registrada y el mensaje de Slack ya debe aparecer marcado como revisado.");
}

export async function POST() {
  return NextResponse.json({ error: "Metodo no permitido." }, { status: 405 });
}
