import assert from "node:assert/strict";
import test from "node:test";
import { createEmbedUrl, missingRetoolEmbedConfig, type RetoolEmbedUser } from "../lib/retool-embed";

const USER: RetoolEmbedUser = {
  id: "adrian",
  name: "JESUS ADRIAN HERNANDEZ LUNA",
  email: "adrian@ejemplo.mx",
  storeId: "clarvex-demo-store",
  storeName: "TH SAN AGUSTIN",
  role: "SUBGERENTE"
};

const VARS = ["RETOOL_API_TOKEN", "RETOOL_ORG_URL", "RETOOL_APP_UUID", "RETOOL_EMBED_GROUP_ID"] as const;

function withConfig<T>(values: Partial<Record<(typeof VARS)[number], string>>, run: () => T): T {
  const previous = new Map(VARS.map((name) => [name, process.env[name]]));
  for (const name of VARS) {
    const value = values[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return run();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const COMPLETA = {
  RETOOL_API_TOKEN: "token-de-prueba",
  RETOOL_ORG_URL: "https://clarvex.retool.com/",
  RETOOL_APP_UUID: "b6ebeac8-95fd-11f1-a579-b33e5e6ede64",
  RETOOL_EMBED_GROUP_ID: "42"
};

function fakeFetch(capture: { url?: string; init?: RequestInit }, response: unknown, status = 200) {
  return (async (url: string, init: RequestInit) => {
    capture.url = url;
    capture.init = init;
    return new Response(JSON.stringify(response), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
}

test("avisa exactamente que variables faltan", () => {
  const faltan = withConfig({ RETOOL_API_TOKEN: "x" }, () => missingRetoolEmbedConfig());
  assert.deepEqual(faltan, ["RETOOL_ORG_URL", "RETOOL_APP_UUID", "RETOOL_EMBED_GROUP_ID"]);
});

test("sin configurar responde 503 nombrando lo que falta", async () => {
  const outcome = await withConfig({}, () => createEmbedUrl(USER));
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 503);
  assert.match(outcome.error, /RETOOL_API_TOKEN/);
});

test("manda la identidad y el storeId en metadata", async () => {
  const capture: { url?: string; init?: RequestInit } = {};
  const outcome = await withConfig(COMPLETA, () =>
    createEmbedUrl(USER, fakeFetch(capture, { embedUrl: "https://clarvex.retool.com/embed/abc" }))
  );
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.url, "https://clarvex.retool.com/embed/abc");

  // La barra final de RETOOL_ORG_URL no debe duplicarse en la ruta.
  assert.equal(capture.url, "https://clarvex.retool.com/api/embed-url/external-user");

  const body = JSON.parse(String(capture.init?.body));
  assert.equal(body.externalIdentifier, "adrian");
  assert.deepEqual(body.groupIds, [42]);
  // Lo que blinda la tienda: viaja en metadata, puesto por el servidor.
  assert.equal(body.metadata.storeId, "clarvex-demo-store");
  assert.equal(body.metadata.role, "SUBGERENTE");
  assert.equal(body.userInfo.email, "adrian@ejemplo.mx");
  assert.equal(body.userInfo.firstName, "JESUS");
});

test("rechaza un group id que no es entero", async () => {
  const outcome = await withConfig({ ...COMPLETA, RETOOL_EMBED_GROUP_ID: "abc" }, () => createEmbedUrl(USER));
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /entero/);
});

test("propaga el mensaje de error de Retool", async () => {
  const capture: { url?: string; init?: RequestInit } = {};
  const outcome = await withConfig(COMPLETA, () =>
    createEmbedUrl(USER, fakeFetch(capture, { message: "Invalid external identifier provided" }, 400))
  );
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 502);
  assert.match(outcome.error, /Invalid external identifier/);
});

test("una respuesta 200 sin embedUrl se trata como error", async () => {
  // Mismo principio que en la app de captura: mejor un fallo ruidoso que dar
  // por buena una respuesta que no trae lo que se pidio.
  const capture: { url?: string; init?: RequestInit } = {};
  const outcome = await withConfig(COMPLETA, () => createEmbedUrl(USER, fakeFetch(capture, { ok: true })));
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /no devolvió una URL/);
});
