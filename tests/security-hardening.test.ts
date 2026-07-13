import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { isAllowedChatMediaBody } from "../lib/chat-message-guard";
import { requireCron } from "../lib/cron-auth";
import { verifyMpSignature } from "../lib/mercadopago-webhook";

test("chat guarda solo proxy de imagen y GIFs de Klipy", () => {
  assert.equal(isAllowedChatMediaBody("hola equipo"), true);
  assert.equal(isAllowedChatMediaBody("[img:/api/chat/file?k=evidences/chat/r/u-1.jpg]"), true);
  assert.equal(isAllowedChatMediaBody("[img:https://evil.example/x.png]"), false);
  assert.equal(isAllowedChatMediaBody("[img:/api/other?k=x]"), false);
  assert.equal(isAllowedChatMediaBody("[gif:https://cdn.klipy.com/x.gif]"), true);
  assert.equal(isAllowedChatMediaBody("[gif:https://evil.example/x.gif]"), false);
  assert.equal(isAllowedChatMediaBody("[gif:http://cdn.klipy.com/x.gif]"), false);
  assert.equal(isAllowedChatMediaBody("[sticker:clap]"), true);
});

test("requireCron rechaza sin secreto o con Bearer inválido", () => {
  const prev = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    const denied = requireCron(new Request("http://localhost/api/cron/x", { headers: { authorization: "Bearer x" } }));
    assert.ok(denied);
    assert.equal(denied!.status, 401);

    process.env.CRON_SECRET = "cron-test-secret-value";
    const bad = requireCron(new Request("http://localhost/api/cron/x", { headers: { authorization: "Bearer wrong" } }));
    assert.ok(bad);
    assert.equal(bad!.status, 401);

    const ok = requireCron(new Request("http://localhost/api/cron/x", { headers: { authorization: "Bearer cron-test-secret-value" } }));
    assert.equal(ok, null);
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
});

test("verifyMpSignature falla cerrado en producción sin secreto", () => {
  const prevSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const prevEnv = process.env.NODE_ENV;
  try {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    process.env.NODE_ENV = "production";
    const req = new Request("http://localhost/api/webhooks/mercadopago");
    assert.equal(verifyMpSignature(req, "123"), false);

    process.env.NODE_ENV = "development";
    assert.equal(verifyMpSignature(req, "123"), true);

    process.env.MERCADOPAGO_WEBHOOK_SECRET = "whsec-test";
    process.env.NODE_ENV = "production";
    const ts = "1710000000";
    const requestId = "req-1";
    const dataId = "pay-9";
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = crypto.createHmac("sha256", "whsec-test").update(manifest).digest("hex");
    const signed = new Request("http://localhost/api/webhooks/mercadopago", {
      headers: {
        "x-request-id": requestId,
        "x-signature": `ts=${ts},v1=${v1}`
      }
    });
    assert.equal(verifyMpSignature(signed, dataId), true);
    assert.equal(verifyMpSignature(signed, "other"), false);
  } finally {
    if (prevSecret === undefined) delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    else process.env.MERCADOPAGO_WEBHOOK_SECRET = prevSecret;
    process.env.NODE_ENV = prevEnv;
  }
});
