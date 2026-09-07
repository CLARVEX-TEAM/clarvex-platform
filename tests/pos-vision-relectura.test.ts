import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as zod from "zod";
import * as productivity from "../lib/pos-productivity";
import * as diagnostics from "../lib/pos-vision-diagnostics";

// Solo los tres importes del rechazo proceden de la foto. El resto de la fila
// es sintético: no conocemos el reporte original ni inferimos sus importes.
const fila = {
  name: "ASESOR SINTETICO", tickets: 2, units: 4, unitsReturned: 1,
  gross: 1000, discount: 100, afterDiscount: 900, returns: 200,
  net: 700, avgUnits: 1.5, avgAmount: 350
};
const reporte = (row = fila) => JSON.stringify({
  from: "2026-09-05", to: "2026-09-05", storeNumber: "TEST", rows: [row]
});
const erroresReportados = [
  { gross: 40249, discount: 13234, afterDiscount: 27715 },
  { gross: 32482, discount: 6434.4, afterDiscount: 16047.6 }
];

type Respuesta = { text: string; ms?: number } | { error: string; ms?: number };
function lector(options: { bedrock?: Respuesta[]; gemini?: Respuesta[] }) {
  let now = 0;
  const calls: Array<{ provider: string; prompt: string; document: string; mime: string }> = [];
  const timeouts: number[] = [];
  const bedrockTimeouts: number[] = [];
  const warnings: unknown[][] = [];
  const queues = { bedrock: [...(options.bedrock ?? [])], gemini: [...(options.gemini ?? [])] };
  const next = (provider: "bedrock" | "gemini") => {
    const response = queues[provider].shift();
    assert.ok(response, `llamada inesperada a ${provider}`);
    now += response.ms ?? 0;
    return response;
  };
  const deps: Record<string, unknown> = {
    zod,
    "@/lib/pos-productivity": productivity,
    "@/lib/pos-vision-diagnostics": diagnostics,
    "@/lib/pos-vision-bedrock": {
      bedrockConfigured: () => options.bedrock !== undefined,
      readWithBedrock: async (prompt: string, document: string, mime: string, timeout: number) => {
        calls.push({ provider: "bedrock", prompt, document, mime });
        bedrockTimeouts.push(timeout);
        const response = next("bedrock");
        return "text" in response ? { ok: true, text: response.text } : { ok: false, problem: response.error };
      }
    }
  };
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync("lib/pos-vision.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(code, {
    exports, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; },
    process: { env: { GEMINI_API_KEY: options.gemini ? "clave-ficticia" : "", POS_VISION_MODEL: "lector-a,lector-b,lector-c" } },
    Date: class extends Date { static now() { return now; } },
    AbortController,
    setTimeout: (_callback: () => void, ms: number) => { timeouts.push(ms); return timeouts.length; },
    clearTimeout: () => {},
    console: { warn: (...args: unknown[]) => warnings.push(args) },
    fetch: async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const parts = body.contents[0].parts;
      calls.push({ provider: "gemini", prompt: parts[0].text, document: parts[1].inline_data.data, mime: parts[1].inline_data.mime_type });
      const response = next("gemini");
      if ("error" in response) throw new DOMException(response.error, "AbortError");
      return Response.json({ candidates: [{ content: { parts: [{ text: response.text }] } }] });
    }
  });
  const trace: diagnostics.PosVisionTrace = { attempts: [] };
  return {
    trace,
    read: () => (exports as typeof import("../lib/pos-vision")).readPosReport("cHJ1ZWJh", "image/png", trace),
    calls, timeouts, bedrockTimeouts, warnings
  };
}

for (const amounts of erroresReportados) {
  test(`POS: bruto ${amounts.gross} incoherente provoca otra lectura, sin corregirlo por cálculo`, async () => {
    const bad = reporte({ ...fila, ...amounts, net: amounts.afterDiscount - fila.returns, avgAmount: (amounts.afterDiscount - fila.returns) / 2 });
    const e = lector({ bedrock: [{ text: bad }], gemini: [{ text: reporte() }] });
    const result = await e.read();
    assert.ok(result.ok);
    assert.equal(e.calls.length, 2);
    assert.equal(result.value.rows[0].gross, fila.gross);
    assert.deepEqual(e.calls.map(c => c.document), ["cHJ1ZWJh", "cHJ1ZWJh"]);
    assert.match(e.calls[1].prompt, /relee/i);
    assert.ok(!JSON.stringify(e.warnings).includes(String(amounts.gross)), "no registrar los importes leídos");
    assert.equal(e.trace.attempts.length, 2);
    assert.equal(e.trace.attempts[0].text, bad);
    assert.equal(e.trace.attempts[0].accepted, false);
    assert.match(e.trace.attempts[0].problem ?? "", new RegExp(String(amounts.gross)));
    assert.equal(e.trace.attempts[1].accepted, true);
  });
}

test("POS: Gemini también relee si el JSON es válido pero las cuentas no", async () => {
  const e = lector({ gemini: [{ text: reporte({ ...fila, afterDiscount: 160 }) }, { text: reporte() }] });
  const result = await e.read();
  assert.ok(result.ok);
  assert.equal(e.calls.length, 2);
  assert.ok(productivity.posCaptureRows(result.value).ok);
});

test("POS: solo Bedrock permite una relectura y no exige configurar Gemini", async () => {
  const e = lector({ bedrock: [{ text: reporte({ ...fila, discount: 17 }) }, { text: reporte() }] });
  assert.ok((await e.read()).ok);
  assert.equal(e.calls.length, 2);
});

test("POS: una devolución pura válida pasa a la primera y conserva el negativo", async () => {
  const row = { ...fila, tickets: 1, units: 0, unitsReturned: -1, gross: 0, discount: 679.6,
    afterDiscount: 679.6, returns: -1699, net: -1019.4, avgUnits: -1, avgAmount: -1019.4 };
  const e = lector({ bedrock: [{ text: reporte(row) }] });
  const result = await e.read();
  assert.ok(result.ok);
  const capture = productivity.posCaptureRows(result.value);
  assert.ok(capture.ok);
  assert.equal(capture.value[0].dailySales, -878.79);
  assert.equal(capture.value[0].discountAmount, null);
  assert.equal(e.calls.length, 1);
});

test("POS: agotar relecturas nunca permite capturar una cuenta inconsistente", async () => {
  const bad = reporte({ ...fila, discount: 123 });
  const e = lector({ bedrock: [{ text: bad }], gemini: [{ text: bad }, { text: bad }, { text: bad }] });
  const result = await e.read();
  assert.equal(result.ok, false);
  assert.equal(e.calls.length, 4);
  if (!result.ok) assert.match(result.error, /PDF|reporte original/);
});

test("POS: el presupuesto de 55 segundos incluye Bedrock y limita el último intento", async () => {
  const e = lector({ bedrock: [{ error: "timeout", ms: 25000 }], gemini: [
    { error: "timeout", ms: 25000 }, { error: "timeout", ms: 5000 }
  ] });
  assert.equal((await e.read()).ok, false);
  assert.equal(e.calls.length, 3);
  assert.deepEqual(e.bedrockTimeouts, [25000]);
  assert.deepEqual(e.timeouts, [25000, 5000]);
  assert.deepEqual(e.trace.attempts.map(a => a.durationMs), [25000, 25000, 5000]);
  assert.ok(e.trace.attempts.every(a => a.text === null && a.problem));
});

test("POS: un JSON ilegible de Gemini tampoco impide probar el siguiente lector", async () => {
  const e = lector({ gemini: [{ text: "{" }, { text: reporte() }] });
  assert.ok((await e.read()).ok);
  assert.equal(e.calls.length, 2);
  assert.equal(e.trace.attempts[0].text, "{");
  assert.match(e.trace.attempts[0].problem ?? "", /JSON/);
});

test("POS: el diagnóstico acota textos largos y declara la truncación", () => {
  const trace: diagnostics.PosVisionTrace = { attempts: [] };
  for (let i = 0; i < 12; i++) diagnostics.recordPosAttempt(trace, {
    provider: "gemini", model: "ficticio", startedAt: new Date(0).toISOString(), durationMs: 1,
    text: "a".repeat(110000), accepted: false, problem: "inválido"
  });
  assert.equal(trace.attempts.length, 8);
  assert.equal(trace.attempts[0].text?.length, 100000);
  assert.equal(trace.attempts[0].textTruncated, true);
});

test("POS: sin proveedores se informa configuración sin intentar una llamada", async () => {
  const e = lector({});
  const result = await e.read();
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /configurada/);
  assert.equal(e.calls.length, 0);
});

test("POS: un reporte de varios días se rechaza sin reintentar para cambiar las fechas", async () => {
  const document = JSON.parse(reporte());
  document.to = "2026-09-06";
  const e = lector({ bedrock: [{ text: JSON.stringify(document) }], gemini: [] });
  const result = await e.read();
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /un solo día/);
  assert.equal(e.calls.length, 1);
});
