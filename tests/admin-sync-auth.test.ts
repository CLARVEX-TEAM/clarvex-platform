import assert from "node:assert/strict";
import test from "node:test";
import { requireAdminSync } from "../lib/admin-sync-auth";

/**
 * El secreto de sincronizacion vive en una herramienta de terceros (Retool),
 * asi que su unico trabajo es no valer para nada mas. Estas pruebas fijan que
 * la puerta este cerrada por defecto.
 */
const conSecreto = (valor: string | undefined, fn: () => void) => {
  const previo = process.env.ADMIN_SYNC_SECRET;
  if (valor === undefined) delete process.env.ADMIN_SYNC_SECRET;
  else process.env.ADMIN_SYNC_SECRET = valor;
  try { fn(); } finally {
    if (previo === undefined) delete process.env.ADMIN_SYNC_SECRET;
    else process.env.ADMIN_SYNC_SECRET = previo;
  }
};

const peticion = (auth?: string) =>
  new Request("https://app.example/api/admin/sync-source", {
    method: "POST",
    headers: auth ? { authorization: auth } : {}
  });

const SECRETO = "x".repeat(40);

test("sin secreto configurado rechaza TODO", () => {
  // Una instalacion que olvide la variable no puede quedarse con un endpoint
  // de escritura abierto.
  conSecreto(undefined, () => {
    assert.equal(requireAdminSync(peticion(`Bearer ${SECRETO}`))?.status, 401);
    assert.equal(requireAdminSync(peticion())?.status, 401);
  });
});

test("un secreto corto no se acepta aunque coincida", () => {
  // Menos de 32 caracteres se adivina; mejor fallar que dar una falsa sensacion
  // de estar protegido.
  conSecreto("corto", () => {
    assert.equal(requireAdminSync(peticion("Bearer corto"))?.status, 401);
  });
});

test("rechaza sin encabezado, con esquema equivocado o con secreto distinto", () => {
  conSecreto(SECRETO, () => {
    assert.equal(requireAdminSync(peticion())?.status, 401);
    assert.equal(requireAdminSync(peticion(SECRETO))?.status, 401, "falta el prefijo Bearer");
    assert.equal(requireAdminSync(peticion(`Bearer ${"y".repeat(40)}`))?.status, 401);
    assert.equal(requireAdminSync(peticion(`bearer ${SECRETO}`))?.status, 401, "el esquema distingue mayusculas");
    // Un secreto del mismo largo pero distinto tiene que fallar en la
    // comparacion, no en el atajo por longitud.
    assert.equal(requireAdminSync(peticion(`Bearer ${"x".repeat(39)}z`))?.status, 401);
  });
});

test("el espacio sobrante del encabezado lo normaliza la plataforma", () => {
  // `Headers` recorta el valor, asi que un espacio al final no llega al
  // comparador. Se documenta para que nadie lo confunda con una comparacion laxa.
  conSecreto(SECRETO, () => {
    assert.equal(requireAdminSync(peticion(`Bearer ${SECRETO} `)), null);
  });
});

test("acepta el secreto correcto", () => {
  conSecreto(SECRETO, () => {
    assert.equal(requireAdminSync(peticion(`Bearer ${SECRETO}`)), null);
  });
});
