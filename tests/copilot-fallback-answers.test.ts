import assert from "node:assert/strict";
import test from "node:test";
import { synthesizeFallbackAnswer } from "../lib/ai/fallback-answers";
import { ProviderError, toUserFacingCopilotError } from "../lib/ai/errors";

test("synthesizeFallbackAnswer — getStorePerformance", () => {
  const answer = synthesizeFallbackAnswer([{
    name: "getStorePerformance",
    content: JSON.stringify({
      periodLabel: "Semana retail 27 (2026-07-05 – 2026-07-11)",
      performance: { sales: 103951, goal: 211071, achievement: 49, remainingToGoal: 107120 }
    })
  }]);
  assert.ok(answer);
  assert.match(answer!, /\$107,120/);
  assert.match(answer!, /49%/);
});

test("synthesizeFallbackAnswer — ignora errores de herramienta", () => {
  const answer = synthesizeFallbackAnswer([{
    name: "getStorePerformance",
    content: JSON.stringify({ error: "Sin datos" })
  }]);
  assert.equal(answer, null);
});

test("toUserFacingCopilotError — oculta mensaje crudo de Groq", () => {
  const facing = toUserFacingCopilotError(new ProviderError("groq", "Rate limit reached for model openai/gpt-oss-20b", { status: 429 }));
  assert.match(facing.message, /muy solicitado/i);
  assert.equal(facing.status, 503);
  assert.equal(facing.retryable, true);
  assert.doesNotMatch(facing.message, /Rate limit/);
});

test("parseRetryAfterMs vía ProviderError", () => {
  const error = new ProviderError("groq", "Rate limit. Please try again in 5.2s", { status: 429, retryAfterMs: 5200 });
  assert.equal(error.retryAfterMs, 5200);
  assert.equal(error.retryable, true);
});
