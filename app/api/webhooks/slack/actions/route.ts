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

  return NextResponse.json({
    response_type: "ephemeral",
    text: `Listo: ${decision.value.title} queda ${ACTION_LABEL[decision.accion]} en la auditoria.`
  });
}
