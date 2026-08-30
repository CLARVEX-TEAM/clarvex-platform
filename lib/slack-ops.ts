import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://slack.com/api/chat.postMessage";
const UPDATE_API = "https://slack.com/api/chat.update";
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

export type SlackOpsAckTokenPayload = {
  source: string;
  title: string;
  createdAt: string;
  channel: string;
  messageTs: string;
  entity: string;
  entityId: string;
  summary: string;
  exp: number;
};

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

function signingSecret(): string {
  return (process.env.SLACK_SIGNING_SECRET ?? process.env.CRON_SECRET ?? "").trim();
}

function sign(data: string): string | null {
  const secret = signingSecret();
  if (secret.length < 16) return null;
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function signSlackOpsAckToken(payload: SlackOpsAckTokenPayload): string | null {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(encoded);
  if (!signature) return null;
  return `${encoded}.${signature}`;
}

function ackUrl(payload: SlackOpsAckTokenPayload): string | null {
  const token = signSlackOpsAckToken(payload);
  if (!token) return null;
  return `${appUrl("/api/webhooks/slack/ack")}?token=${encodeURIComponent(token)}`;
}

export function verifySlackOpsAckToken(rawToken: string | null | undefined, now = Date.now()): SlackOpsAckTokenPayload | null {
  if (!rawToken) return null;
  const [encoded, signature, extra] = rawToken.split(".");
  if (!encoded || !signature || extra !== undefined) return null;

  const expected = sign(encoded);
  if (!expected || !safeEquals(signature, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<SlackOpsAckTokenPayload>;
    if (
      typeof parsed.source === "string" &&
      typeof parsed.title === "string" &&
      typeof parsed.createdAt === "string" &&
      typeof parsed.channel === "string" &&
      typeof parsed.messageTs === "string" &&
      typeof parsed.entity === "string" &&
      typeof parsed.entityId === "string" &&
      typeof parsed.summary === "string" &&
      typeof parsed.exp === "number" &&
      parsed.exp >= Math.floor(now / 1000)
    ) {
      return {
        source: parsed.source,
        title: parsed.title,
        createdAt: parsed.createdAt,
        channel: parsed.channel,
        messageTs: parsed.messageTs,
        entity: parsed.entity,
        entityId: parsed.entityId,
        summary: parsed.summary,
        exp: parsed.exp
      };
    }
  } catch {
    return null;
  }
  return null;
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

function buildAlertBlocks(alert: Required<SlackOpsAlert>, reviewUrl?: string | null) {
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
          ...(reviewUrl ? { url: reviewUrl } : {}),
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

function reviewedBlocks(payload: SlackOpsAckTokenPayload) {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: `[OK] ${payload.title}`.slice(0, 150), emoji: false }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Fuente:* ${escapeSlack(payload.source)}\n${escapeSlack(payload.summary).slice(0, 1600)}`
      }
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `Quedo *revisado* desde Slack - ${new Date().toISOString()}` }]
    },
    {
      type: "actions",
      elements: [
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

export async function updateSlackOpsMessageReviewed(payload: SlackOpsAckTokenPayload): Promise<SlackOpsResult> {
  const token = process.env.SLACK_BOT_TOKEN ?? "";
  if (!token) return { ok: false, problema: "sin token" };

  try {
    const response = await fetch(UPDATE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        channel: payload.channel,
        ts: payload.messageTs,
        text: `${payload.title} queda revisado desde Slack`,
        blocks: reviewedBlocks(payload)
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const data = (await response.json()) as { ok?: boolean; ts?: string; error?: string };
    if (!data.ok) return { ok: false, problema: data.error ?? `http ${response.status}` };
    return { ok: true, ts: data.ts ?? payload.messageTs };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, problema: "tardo demasiado" };
    return { ok: false, problema: "no se pudo contactar" };
  }
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
    const data = (await response.json()) as { ok?: boolean; channel?: string; ts?: string; error?: string };
    if (!data.ok) return { ok: false, problema: data.error ?? `http ${response.status}` };
    const postedChannel = data.channel ?? channel;
    const postedTs = data.ts ?? "";
    const reviewUrl = postedTs
      ? ackUrl({
          source: alert.source,
          title: alert.title,
          createdAt: alert.createdAt,
          channel: postedChannel,
          messageTs: postedTs,
          entity: "SlackOpsAlert",
          entityId: `${alert.source}:${alert.createdAt}`,
          summary: alert.text.slice(0, 1200),
          exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
        })
      : null;
    if (reviewUrl) {
      await fetch(UPDATE_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          channel: postedChannel,
          ts: postedTs,
          text,
          unfurl_links: false,
          unfurl_media: false,
          blocks: buildAlertBlocks(alert, reviewUrl)
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      }).catch(() => undefined);
    }
    return { ok: true, ts: postedTs };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, problema: "tardo demasiado" };
    return { ok: false, problema: "no se pudo contactar" };
  }
}
