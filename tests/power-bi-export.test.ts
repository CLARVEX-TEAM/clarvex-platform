import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDevToolsFetch, parseDevToolsFetch } from "../lib/integrations/power-bi-fetch-parser";
import { patchExportPayload } from "../lib/integrations/power-bi-export";
import { PowerBiTokenExpiredError } from "../lib/integrations/power-bi-errors";

const SAMPLE_FETCH = String.raw`fetch("https://wabi-west-us-b-primary-redirect.analysis.windows.net/export/xlsx", {
  "headers": {
    "accept": "*/*",
    "accept-language": "es-MX,es;q=0.9",
    "authorization": "Bearer eyJ.fake.token",
    "content-type": "application/json",
    "sec-fetch-mode": "cors",
    "referer": "https://app.powerbi.com/"
  },
  "body": "{\"artifactId\":\"art-1\",\"modelId\":\"mod-1\",\"executeSemanticQueryRequest\":{\"queries\":[]},\"ExportDataCommand\":{},\"Columns\":[\"Venta\"],\"FiltersDescription\":[],\"Ordering\":[]}",
  "method": "POST"
});`;

test("parseDevToolsFetch extrae url, headers y body JSON", () => {
  const parsed = parseDevToolsFetch(SAMPLE_FETCH);
  assert.equal(parsed.method, "POST");
  assert.match(parsed.url, /export\/xlsx/);
  assert.equal(parsed.headers.authorization, "Bearer eyJ.fake.token");
  assert.equal((parsed.body as { artifactId: string }).artifactId, "art-1");
});

test("analyzeDevToolsFetch conserva solo headers imprescindibles", () => {
  const analysis = analyzeDevToolsFetch(SAMPLE_FETCH);
  assert.ok(analysis.essentialHeaders.authorization.includes("REDACTED"));
  assert.equal(analysis.essentialHeaders["content-type"], "application/json");
  assert.ok(analysis.removedHeaders.includes("referer"));
  assert.ok(analysis.removedHeaders.includes("sec-fetch-mode"));
  assert.equal(analysis.reusableWithUrlTokenPayload, true);
  assert.ok(analysis.dynamicFields.some((field) => /artifactId|executeSemanticQueryRequest/i.test(field)));
});

test("patchExportPayload modifica filtros y columnas sin mutar plantilla", () => {
  const template = {
    artifactId: "art-1",
    modelId: "mod-1",
    Columns: ["A"],
    FiltersDescription: [{ field: "Tienda", value: "T1" }]
  };
  const patched = patchExportPayload(template, {
    columns: ["Venta", "Empleado"],
    filtersDescription: [{ field: "Fecha", value: "2026-07-10" }]
  });
  assert.deepEqual(template.Columns, ["A"]);
  assert.deepEqual(patched.Columns, ["Venta", "Empleado"]);
  assert.deepEqual(patched.FiltersDescription, [{ field: "Fecha", value: "2026-07-10" }]);
});

test("exportPowerBI rechaza token expirado con 401", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("Unauthorized", { status: 401, headers: { "content-type": "text/plain" } });

  try {
    const { exportPowerBI } = await import("../lib/integrations/power-bi-export");
    await assert.rejects(
      () => exportPowerBI("Bearer short-lived", { artifactId: "x" }, "https://example.com/export/xlsx"),
      (error: unknown) => error instanceof PowerBiTokenExpiredError
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("exportPowerBI devuelve Buffer xlsx cuando la respuesta es zip", async () => {
  const xlsxBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(xlsxBytes, {
      status: 200,
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
    });

  try {
    const { exportPowerBI } = await import("../lib/integrations/power-bi-export");
    const buffer = await exportPowerBI("Bearer ok", { artifactId: "x" }, "https://example.com/export/xlsx");
    assert.ok(Buffer.isBuffer(buffer));
    assert.equal(buffer[0], 0x50);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
