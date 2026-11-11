import assert from "node:assert/strict";
import test from "node:test";

process.env.AUTH_SECRET ??= "x".repeat(40);

test("el código del reloj: 6 letras sin las que se confunden", async () => {
  const { generarCodigo, normalizarCodigo } = await import("../lib/reloj");
  for (let i = 0; i < 200; i++) {
    const c = generarCodigo();
    assert.match(c, /^[A-HJKMNP-Z2-9]{6}$/);
    assert.equal(normalizarCodigo(c), c);
  }
  assert.equal(normalizarCodigo("k7m-4qx"), "K7M4QX");
  assert.equal(normalizarCodigo("K7M 4QX"), "K7M4QX");
  assert.equal(normalizarCodigo("K7M4Q0"), null, "el 0 no existe en el alfabeto");
  assert.equal(normalizarCodigo("K7M4Q"), null);
});

test("el bot reconoce «reloj CÓDIGO» y nada más", async () => {
  const { pideVincularReloj } = await import("../lib/reloj");
  assert.equal(pideVincularReloj("reloj K7M4QX"), "K7M4QX");
  assert.equal(pideVincularReloj("Reloj k7m-4qx"), "K7M4QX");
  assert.equal(pideVincularReloj("reloj K7M 4QX!"), "K7M4QX");
  for (const t of ["reloj", "mi reloj no sirve", "reloj nuevo para Itzel", "K7M4QX"]) assert.equal(pideVincularReloj(t), null, t);
});

test("el token del reloj va y vuelve, y no sirve como sesión ni como código del Forms", async () => {
  const { crearTokenReloj, leerTokenReloj } = await import("../lib/reloj");
  const { verifySessionToken } = await import("../lib/session-token");
  const { leerCodigoForms } = await import("../lib/forms-axo");
  const token = await crearTokenReloj({ id: "u1", storeId: "s1", sessionVersion: 2 });
  assert.deepEqual(await leerTokenReloj(token), { userId: "u1", storeId: "s1", sv: 2 });
  assert.equal(await verifySessionToken(token), null);
  assert.equal(await leerCodigoForms(token), null);
  assert.equal(await leerTokenReloj(token + "x"), null);
});

test("el secreto del reloj se guarda solo como huella", async () => {
  const { huella } = await import("../lib/reloj");
  const h = huella("a".repeat(40));
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, "a".repeat(40));
});
