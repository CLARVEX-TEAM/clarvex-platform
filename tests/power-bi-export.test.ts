import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { analyzeDevToolsFetch, decodeJwtExpiresAt, parseDevToolsConnection, parseDevToolsFetch } from "../lib/integrations/power-bi-fetch-parser";
import {
  exportPowerBI,
  patchExportPayload,
  patchRetailCalendarFilters,
  summarizeExportPayload
} from "../lib/integrations/power-bi-export";
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

const REAL_FETCH_PATH = "tests/fixtures/power-bi-metrics-fetch.txt";

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

test("parseDevToolsConnection extrae token, url y payload del fetch", () => {
  const source = readFileSync(REAL_FETCH_PATH, "utf8");
  const connection = parseDevToolsConnection(source);
  assert.match(connection.bearerToken, /^Bearer /);
  assert.match(connection.exportUrl, /export\/xlsx/);
  assert.equal((connection.exportPayloadTemplate as { artifactId: number }).artifactId, 6844699);
});

test("decodeJwtExpiresAt lee exp de un JWT", () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = Buffer.from(JSON.stringify({ exp, upn: "demo@grupoaxo.com" })).toString("base64url");
  const token = `Bearer header.${payload}.signature`;
  const expiresAt = decodeJwtExpiresAt(token);
  assert.ok(expiresAt instanceof Date);
  assert.equal(expiresAt?.getTime(), exp * 1000);
});

test("fetch real de métricas: headers mínimos y payload anidado", () => {
  const source = readFileSync(REAL_FETCH_PATH, "utf8");
  const analysis = analyzeDevToolsFetch(source);
  assert.equal(
    analysis.url,
    "https://wabi-south-central-us-redirect.analysis.windows.net/export/xlsx"
  );
  assert.ok(analysis.removedHeaders.includes("activityid"));
  assert.ok(analysis.removedHeaders.includes("requestid"));
  assert.ok(analysis.removedHeaders.includes("x-powerbi-hostenv"));
  const payloadKeys =
    analysis.payload && typeof analysis.payload === "object"
      ? Object.keys(analysis.payload as Record<string, unknown>)
      : [];
  assert.deepEqual(payloadKeys, ["exportDataType", "executeSemanticQueryRequest", "artifactId"]);

  const summary = summarizeExportPayload(analysis.payload as Record<string, unknown>);
  assert.equal(summary.artifactId, 6844699);
  assert.equal(summary.modelId, 6410841);
  assert.deepEqual(summary.calendarFilter, { day: 11, month: 7, year: 2026 });
  assert.ok(summary.columns.includes("SALES"));
  assert.ok(summary.columns.includes("EMPLOYEE"));
});

test("patchRetailCalendarFilters actualiza Where y FiltersDescription", () => {
  const source = readFileSync(REAL_FETCH_PATH, "utf8");
  const { body } = parseDevToolsFetch(source);
  const template = body as Record<string, unknown>;

  const patched = patchRetailCalendarFilters(template, { day: 10, month: 7, year: 2026 });
  const summary = summarizeExportPayload(patched);

  assert.deepEqual(summary.calendarFilter, { day: 10, month: 7, year: 2026 });
  assert.match(summary.filtersDescription ?? "", /DAY es 10/);
  assert.deepEqual(template, body);
});

test("patchExportPayload modifica columnas anidadas sin mutar plantilla", () => {
  const source = readFileSync(REAL_FETCH_PATH, "utf8");
  const { body } = parseDevToolsFetch(source);
  const template = body as Record<string, unknown>;

  const patched = patchExportPayload(template, {
    columns: [{ QueryName: "01 METRICAS.SALES", Name: "SALES" }]
  });
  const summary = summarizeExportPayload(patched);
  assert.deepEqual(summary.columns, ["SALES"]);
  assert.notEqual(template, patched);
});

test("exportPowerBI rechaza token expirado con 401", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("Unauthorized", { status: 401, headers: { "content-type": "text/plain" } });

  try {
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
    const buffer = await exportPowerBI("Bearer ok", { artifactId: "x" }, "https://example.com/export/xlsx");
    assert.ok(Buffer.isBuffer(buffer));
    assert.equal(buffer[0], 0x50);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
