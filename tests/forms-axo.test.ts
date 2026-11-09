import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

process.env.AUTH_SECRET ??= "x".repeat(40);

test("el código del Forms va y vuelve con su usuario, tienda y versión de sesión", async () => {
  const { crearCodigoForms, leerCodigoForms } = await import("../lib/forms-axo");
  const codigo = await crearCodigoForms({ id: "u1", storeId: "clarvex-demo-store", sessionVersion: 3 });
  assert.deepEqual(await leerCodigoForms(codigo), { userId: "u1", storeId: "clarvex-demo-store", sv: 3 });
  assert.equal(await leerCodigoForms(codigo + "x"), null);
  assert.equal(await leerCodigoForms("basura"), null);
});

test("el código del Forms NO sirve como sesión", async () => {
  const { crearCodigoForms } = await import("../lib/forms-axo");
  const { verifySessionToken } = await import("../lib/session-token");
  const codigo = await crearCodigoForms({ id: "u1", storeId: "s", sessionVersion: 0 });
  assert.equal(await verifySessionToken(codigo), null);
});

test("una sesión NO sirve como código del Forms", async () => {
  const { leerCodigoForms } = await import("../lib/forms-axo");
  const { createSessionToken } = await import("../lib/session-token");
  const sesion = await createSessionToken({ id: "u1", storeId: "s", role: "GERENTE", sessionVersion: 0 } as never);
  assert.equal(await leerCodigoForms(sesion), null);
});

test("el bot reconoce cuando piden el código", async () => {
  const { pideCodigoForms } = await import("../lib/forms-axo");
  for (const t of ["código forms", "Codigo del Forms", "código para el forms?", "codigo form"]) assert.equal(pideCodigoForms(t), true, t);
  for (const t of ["ya llené el forms", "código", "me pasas el código forms de Itzel"]) assert.equal(pideCodigoForms(t), false, t);
});

const script = readFileSync(path.join(__dirname, "..", "public", "forms-axo.user.js"), "utf8");

test("el script NUNCA pica Enviar", () => {
  assert.equal(/enviar"|submit/i.test(script.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "")), false);
  assert.match(script, /data-automation-id="nextButton"/);
  assert.equal(script.includes("submitButton\"]"), false, "el botón de Enviar no se busca nunca");
});

test("el script solo habla con Clarvex y solo corre en Microsoft Forms", () => {
  const cabecera = script.slice(0, script.indexOf("==/UserScript=="));
  assert.deepEqual([...cabecera.matchAll(/@connect\s+(\S+)/g)].map((m) => m[1]), ["team.clarvex.tech"]);
  assert.deepEqual([...cabecera.matchAll(/@match\s+(\S+)/g)].map((m) => m[1]), ["https://forms.cloud.microsoft/*", "https://forms.office.com/*"]);
});

test("el script no depende del idioma del Forms (en inglés dice «Next» y «November»)", () => {
  assert.equal(/=== "siguiente"|=== "atras"/.test(script), false);
  assert.match(script, /\["noviembre", "november"\]/);
});
