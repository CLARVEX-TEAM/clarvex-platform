import assert from "node:assert/strict";
import test from "node:test";

(process.env as Record<string, string>).NODE_ENV = "test";
(process.env as Record<string, string>).MOCK_EXTERNAL_SERVICES = "true";

test("ProviderRouter reintenta en 429 antes del siguiente proveedor", async () => {
  const { ProviderRouter } = await import("../lib/ai/providers/provider-router");
  let groqCalls = 0;

  class FlakyGroq {
    readonly name = "groq";
    isConfigured() { return true; }
    async chatComplete() {
      groqCalls += 1;
      if (groqCalls < 2) {
        const { ProviderError } = await import("../lib/ai/errors");
        throw new ProviderError("groq", "Rate limit", { status: 429, retryAfterMs: 10 });
      }
      return {
        content: "ok",
        toolCalls: [],
        usage: null,
        model: "m",
        provider: "groq",
        finishReason: "stop"
      };
    }
  }

  class Backup {
    readonly name = "cloudflare";
    isConfigured() { return true; }
    async chatComplete() {
      return {
        content: "backup",
        toolCalls: [],
        usage: null,
        model: "m",
        provider: "cloudflare",
        finishReason: "stop"
      };
    }
  }

  const router = new ProviderRouter();
  (router as unknown as { chain: unknown[] }).chain = [new FlakyGroq(), new Backup()];

  const result = await router.chatComplete({
    model: "m",
    messages: [{ role: "user", content: "hola" }]
  });

  assert.equal(result.content, "ok");
  assert.equal(groqCalls, 2);
});
