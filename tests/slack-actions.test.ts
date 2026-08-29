import assert from "node:assert/strict";
import test from "node:test";
import { parseSlackActionBody } from "../lib/slack-actions";
import { encodeSlackOpsValue, SLACK_OPS_ACTIONS, type SlackOpsButtonValue } from "../lib/slack-ops";

const value: SlackOpsButtonValue = {
  kind: "alert",
  source: "kardex-audit",
  title: "Diferencia en kardex",
  createdAt: "2026-08-29T12:00:00.000Z",
  entity: "SlackOpsAlert",
  entityId: "kardex-audit:2026-08-29T12:00:00.000Z"
};

function body(payload: unknown): string {
  return new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
}

test("decodifica el boton de revisar una alerta operativa", () => {
  const decision = parseSlackActionBody(body({
    type: "block_actions",
    user: { id: "U123", name: "adrian" },
    channel: { id: "COPS" },
    message: { ts: "1724947200.000000" },
    actions: [{ action_id: SLACK_OPS_ACTIONS.ackAlert, value: encodeSlackOpsValue(value) }]
  }));

  assert.equal(decision.accion, "ack");
  if (decision.accion === "ack") {
    assert.equal(decision.userId, "U123");
    assert.equal(decision.userName, "adrian");
    assert.deepEqual(decision.value, value);
  }
});

test("ignora acciones que no son del centro operativo", () => {
  const decision = parseSlackActionBody(body({
    type: "block_actions",
    user: { id: "U123" },
    actions: [{ action_id: "otra_accion", value: encodeSlackOpsValue(value) }]
  }));

  assert.equal(decision.accion, "ignorar");
});

test("ignora payloads mal formados", () => {
  assert.equal(parseSlackActionBody("payload=%7B").accion, "ignorar");
  assert.equal(parseSlackActionBody("").accion, "ignorar");
});
