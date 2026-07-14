import test from "node:test";
import assert from "node:assert/strict";
import { isPhotoWebhookEnabled } from "../lib/webhooks";

function withEnv(env: Record<string, string | undefined>, run: () => void) {
  const previous = { WEBHOOK_URL: process.env.WEBHOOK_URL, WEBHOOK_STORE_IDS: process.env.WEBHOOK_STORE_IDS };
  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  try {
    run();
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

test("sin WEBHOOK_URL no se manda nada", () => {
  withEnv({ WEBHOOK_URL: undefined, WEBHOOK_STORE_IDS: "tienda-a" }, () => {
    assert.equal(isPhotoWebhookEnabled("tienda-a"), false);
  });
});

test("con URL pero sin lista de tiendas tampoco se manda", () => {
  // Es a propósito: un webhook "para todas las tiendas" por defecto filtraría las
  // fotos de una tienda al canal de otra. Hay que optar por cada tienda.
  withEnv({ WEBHOOK_URL: "https://n8n.example/hook", WEBHOOK_STORE_IDS: undefined }, () => {
    assert.equal(isPhotoWebhookEnabled("tienda-a"), false);
  });
});

test("solo se manda desde las tiendas de la lista", () => {
  withEnv({ WEBHOOK_URL: "https://n8n.example/hook", WEBHOOK_STORE_IDS: "tienda-a, tienda-c" }, () => {
    assert.equal(isPhotoWebhookEnabled("tienda-a"), true);
    assert.equal(isPhotoWebhookEnabled("tienda-c"), true);
    assert.equal(isPhotoWebhookEnabled("tienda-b"), false);
  });
});

test("una lista vacía o de comas sueltas no habilita a nadie", () => {
  withEnv({ WEBHOOK_URL: "https://n8n.example/hook", WEBHOOK_STORE_IDS: " , , " }, () => {
    assert.equal(isPhotoWebhookEnabled("tienda-a"), false);
    assert.equal(isPhotoWebhookEnabled(""), false);
  });
});
