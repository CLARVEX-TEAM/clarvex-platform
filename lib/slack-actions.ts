import { decodeSlackOpsValue, SLACK_OPS_ACTIONS, type SlackOpsButtonValue } from "@/lib/slack-ops";

export type SlackActionDecision =
  | { accion: "ignorar"; porque: string }
  | {
      accion: "ack" | "approve" | "reject";
      value: SlackOpsButtonValue;
      actionId: string;
      userId: string;
      userName: string | null;
      channelId: string | null;
      messageTs: string | null;
      responseUrl: string | null;
      originalText: string | null;
    };

type SlackInteraction = {
  type?: string;
  user?: { id?: string; username?: string; name?: string };
  channel?: { id?: string };
  message?: {
    ts?: string;
    text?: string;
    blocks?: Array<{ type?: string; text?: { type?: string; text?: string } }>;
  };
  response_url?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
};

function originalMessageText(message: SlackInteraction["message"]): string | null {
  const sectionText = message?.blocks?.find((block) => block.type === "section" && block.text?.text)?.text?.text;
  if (sectionText) return sectionText;
  return message?.text ?? null;
}

export function parseSlackActionBody(rawBody: string): SlackActionDecision {
  const payload = new URLSearchParams(rawBody).get("payload");
  if (!payload) return { accion: "ignorar", porque: "sin payload" };

  let parsed: SlackInteraction;
  try {
    parsed = JSON.parse(payload) as SlackInteraction;
  } catch {
    return { accion: "ignorar", porque: "payload invalido" };
  }

  if (parsed.type !== "block_actions") return { accion: "ignorar", porque: `tipo ${parsed.type ?? "(vacio)"}` };
  const action = parsed.actions?.[0];
  if (!action?.action_id) return { accion: "ignorar", porque: "sin action_id" };
  if (!parsed.user?.id) return { accion: "ignorar", porque: "sin usuario" };

  const value = action.value ? decodeSlackOpsValue(action.value) : null;
  if (!value) return { accion: "ignorar", porque: "valor invalido" };

  const accion =
    action.action_id === SLACK_OPS_ACTIONS.ackAlert
      ? "ack"
      : action.action_id === SLACK_OPS_ACTIONS.approve
        ? "approve"
        : action.action_id === SLACK_OPS_ACTIONS.reject
          ? "reject"
          : null;
  if (!accion) return { accion: "ignorar", porque: `accion ${action.action_id}` };

  return {
    accion,
    value,
    actionId: action.action_id,
    userId: parsed.user.id,
    userName: parsed.user.name ?? parsed.user.username ?? null,
    channelId: parsed.channel?.id ?? null,
    messageTs: parsed.message?.ts ?? null,
    responseUrl: parsed.response_url ?? null,
    originalText: originalMessageText(parsed.message)
  };
}
