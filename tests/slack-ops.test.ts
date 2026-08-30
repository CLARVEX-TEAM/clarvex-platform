import assert from "node:assert/strict";
import test from "node:test";
import { signSlackOpsAckToken, verifySlackOpsAckToken, type SlackOpsAckTokenPayload } from "../lib/slack-ops";

const nowMs = Date.parse("2026-08-30T02:00:00.000Z");

const payload: SlackOpsAckTokenPayload = {
  source: "prueba-manual",
  title: "Prueba de alerta Slack con estado",
  createdAt: "2026-08-30T01:44:15.663Z",
  channel: "COPS",
  messageTs: "1788054255.775329",
  entity: "SlackOpsAlert",
  entityId: "prueba-manual:2026-08-30T01:44:15.663Z",
  summary: "Mensaje de prueba.",
  exp: Math.floor(nowMs / 1000) + 60
};

test("firma y verifica el token del boton de revisar", () => {
  process.env.SLACK_SIGNING_SECRET = "test-signing-secret-with-enough-length";
  const token = signSlackOpsAckToken(payload);

  assert.ok(token);
  assert.deepEqual(verifySlackOpsAckToken(token, nowMs), payload);
});

test("rechaza un token manipulado", () => {
  process.env.SLACK_SIGNING_SECRET = "test-signing-secret-with-enough-length";
  const token = signSlackOpsAckToken(payload);
  assert.ok(token);

  const [encoded, signature] = token.split(".");
  const changed = Buffer.from(JSON.stringify({ ...payload, title: "Otro titulo" }), "utf8").toString("base64url");

  assert.equal(verifySlackOpsAckToken(`${changed}.${signature}`, nowMs), null);
  assert.equal(verifySlackOpsAckToken(`${encoded}.firma-mala`, nowMs), null);
});

test("rechaza un token vencido", () => {
  process.env.SLACK_SIGNING_SECRET = "test-signing-secret-with-enough-length";
  const token = signSlackOpsAckToken({ ...payload, exp: Math.floor(nowMs / 1000) - 1 });

  assert.ok(token);
  assert.equal(verifySlackOpsAckToken(token, nowMs), null);
});
