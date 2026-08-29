const API = "https://slack.com/api/chat.postMessage";
const TIMEOUT_MS = 8_000;

export type SlackOpsAlert = {
  source: string;
  title: string;
  text: string;
  createdAt?: string;
};

export type SlackOpsButtonValue = {
  kind: "alert" | "approval";
  source: string;
  title: string;
  createdAt: string;
  entity?: string;
  entityId?: string;
};

export type SlackOpsResult = { ok: true; ts: string } | { ok: false; problema: string };

export const SLACK_OPS_ACTIONS = {
  ackAlert: "clarvex_ops_ack",
  approve: "clarvex_ops_approve",
  reject: "clarvex_ops_reject",
  openAudit: "clarvex_ops_open_audit",
  openAdmin: "clarvex_ops_open_admin"
} as const;

function opsChannel(): string {
  return (process.env.SLACK_OPS_CHANNEL ?? process.env.SLACK_ALERT_CHANNEL ?? "").trim();
}

export function slackOpsConfigurado(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN && opsChannel());
}

function escapeSlack(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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

export function encodeSlackOpsValue(value: SlackOpsButtonValue): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeSlackOpsValue(raw: string): SlackOpsButtonValue | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<SlackOpsButtonValue>;
    if (
      (parsed.kind === "alert" || parsed.kind === "approval") &&
      typeof parsed.source === "string" &&
      typeof parsed.title === "string" &&
      typeof parsed.createdAt === "string"
    ) {
      return {
        kind: parsed.kind,
        source: parsed.source,
        title: parsed.title,
        createdAt: parsed.createdAt,
        entity: typeof parsed.entity === "string" ? parsed.entity : undefined,
        entityId: typeof parsed.entityId === "string" ? parsed.entityId : undefined
      };
    }
  } catch {
    return null;
  }
  return null;
}

function buildAlertBlocks(alert: Required<SlackOpsAlert>) {
  const value = encodeSlackOpsValue({
    kind: "alert",
    source: alert.source,
    title: alert.title,
    createdAt: alert.createdAt,
    entity: "SlackOpsAlert",
    entityId: `${alert.source}:${alert.createdAt}`
  });

  return [
    {
      type: "header",
      text: { type: "plain_text", text: alert.title.slice(0, 150), emoji: false }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Fuente:* ${escapeSlack(alert.source)}\n${escapeSlack(alert.text).slice(0, 2800)}`
      }
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `Creada ${escapeSlack(alert.createdAt)}` }]
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Marcar revisado", emoji: false },
          action_id: SLACK_OPS_ACTIONS.ackAlert,
          value,
          style: "primary"
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Abrir auditoria", emoji: false },
          action_id: SLACK_OPS_ACTIONS.openAudit,
          url: retoolAuditUrl()
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Abrir Clarvex", emoji: false },
          action_id: SLACK_OPS_ACTIONS.openAdmin,
          url: appUrl()
        }
      ]
    }
  ];
}

export async function sendSlackOpsAlert(payload: SlackOpsAlert): Promise<SlackOpsResult> {
  const token = process.env.SLACK_BOT_TOKEN ?? "";
  const channel = opsChannel();
  if (!token) return { ok: false, problema: "sin token" };
  if (!channel) return { ok: false, problema: "sin canal" };

  const alert = { ...payload, createdAt: payload.createdAt ?? new Date().toISOString() };
  const text = `[${alert.source}] ${alert.title}: ${alert.text}`.slice(0, 3000);

  try {
    const response = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        channel,
        text,
        unfurl_links: false,
        unfurl_media: false,
        blocks: buildAlertBlocks(alert)
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const data = (await response.json()) as { ok?: boolean; ts?: string; error?: string };
    if (!data.ok) return { ok: false, problema: data.error ?? `http ${response.status}` };
    return { ok: true, ts: data.ts ?? "" };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, problema: "tardo demasiado" };
    return { ok: false, problema: "no se pudo contactar" };
  }
}
