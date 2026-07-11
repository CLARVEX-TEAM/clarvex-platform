import assert from "node:assert/strict";
import test from "node:test";
import { toCopilotApiMessages } from "../lib/ai/copilot-messages";

test("toCopilotApiMessages envía el hilo completo al API", () => {
  const payload = toCopilotApiMessages([
    { role: "assistant", content: "Hola" },
    { role: "user", content: "Hoy es 10 de julio" },
    { role: "assistant", content: "¿Quieres los resultados del día?" },
    { role: "user", content: "Sí" }
  ]);
  assert.equal(payload.length, 4);
  assert.equal(payload.at(-1)?.content, "Sí");
  assert.equal(payload[1]?.content, "Hoy es 10 de julio");
});

test("toCopilotApiMessages limita a los últimos 20 turnos", () => {
  const many = Array.from({ length: 25 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `m${index}`
  }));
  assert.equal(toCopilotApiMessages(many).length, 20);
  assert.equal(toCopilotApiMessages(many)[0]?.content, "m5");
});
