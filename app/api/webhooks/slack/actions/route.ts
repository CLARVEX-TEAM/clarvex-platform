import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseSlackActionBody } from "@/lib/slack-actions";
import { verificarFirmaSlack } from "@/lib/slack-chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTION_LABEL: Record<"ack" | "approve" | "reject", string> = {
  ack: "revisado",
  approve: "aprobado",
  reject: "rechazado"
};

const ACTION_ICON: Record<"ack" | "approve" | "reject", string> = {
  ack: "[OK]",
  approve: "[OK]",
  reject: "[NO]"
};

function appUrl(path = "/escritorio/admin"): string {
  const base = (process.env.APP_URL ?? process.env.WEBAUTHN_ORIGIN ?? "https://team.clarvex.tech").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function retoolAuditUrl(): string {
  const explicit = process.env.RETOOL_AUDIT_URL?.trim();
  if (explicit) return explicit;
  const org = (process.env.RETOOL_ORG_URL ?? "https://captura.adrianluna.mx").replace(/\/+$/, "");
  return `${org}/rr/app/captura-clarvex/auditoria`;
}

function reviewedSlackResponse(decision: Exclude<ReturnType<typeof parseSlackActionBody>, { accion: "ignorar" }>) {
  const actor = decision.userName ? `@${decision.userName}` : decision.userId;
  const status = ACTION_LABEL[decision.accion];
  const reviewedAt = new Date().toISOString();
  const originalText = decision.originalText ?? `*Fuente:* ${decision.value.source}`;

  return {
    replace_original: true,
    text: `${decision.value.title} queda ${status} por ${actor}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${ACTION_ICON[decision.accion]} ${decision.value.title}`.slice(0, 150),
          emoji: false
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: originalText.slice(0, 2800)
        }
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Quedo *${status}* por ${actor} - ${reviewedAt}`
          }
        ]
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Abrir auditoria", emoji: false },
            action_id: "clarvex_ops_open_audit",
            url: retoolAuditUrl()
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Abrir Clarvex", emoji: false },
            action_id: "clarvex_ops_open_admin",
            url: appUrl()
          }
        ]
      }
    ]
  };
}

/**
 * Botones interactivos de Slack para el centro de mando.
 *
 * El endpoint es público porque Slack llama desde fuera, pero exige la misma
 * firma que el espejo del chat. La acción no ejecuta lógica de negocio por sí
 * sola: primero deja una marca auditable en `AuditLog`. Los flujos concretos
 * pueden engancharse después a `slack.ops.approve` / `slack.ops.reject` sin
 * perder el historial.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const firma = verificarFirmaSlack(
    raw,
    request.headers.get("x-slack-signature"),
    request.headers.get("x-slack-request-timestamp")
  );
  if (!firma.ok) {
    console.warn(`[slack-actions] firma rechazada: ${firma.motivo}`);
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const decision = parseSlackActionBody(raw);
  if (decision.accion === "ignorar") {
    console.info(`[slack-actions] ignorado: ${decision.porque}`);
    return NextResponse.json({ text: "Accion ignorada." });
  }

  const entity = decision.value.entity ?? (decision.value.kind === "approval" ? "SlackApproval" : "SlackOpsAlert");
  const entityId = decision.value.entityId ?? `${decision.value.source}:${decision.value.createdAt}`;
  await prisma.auditLog.create({
    data: {
      actorId: decision.userId,
      actorName: decision.userName ? `Slack ${decision.userName}` : `Slack ${decision.userId}`,
      action: `slack.ops.${decision.accion}`,
      entity,
      entityId,
      detail: JSON.stringify({
        title: decision.value.title,
        source: decision.value.source,
        createdAt: decision.value.createdAt,
        channelId: decision.channelId,
        messageTs: decision.messageTs,
        actionId: decision.actionId
      })
    }
  });

  return NextResponse.json(reviewedSlackResponse(decision));
}
