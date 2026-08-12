import assert from "node:assert/strict";
import test from "node:test";
import { requireAdminCapture } from "../lib/admin-capture-auth";

const SECRET = "a".repeat(64);

function withSecret<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.ADMIN_CAPTURE_SECRET;
  if (value === undefined) delete process.env.ADMIN_CAPTURE_SECRET;
  else process.env.ADMIN_CAPTURE_SECRET = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.ADMIN_CAPTURE_SECRET;
    else process.env.ADMIN_CAPTURE_SECRET = previous;
  }
}

/**
 * `SIN_SECRETO` es un centinela, no `undefined`: pasar `undefined` a un
 * parametro con valor por defecto activa ese valor por defecto, asi que el
 * caso "sin secreto configurado" se probaba a si mismo al reves.
 */
const SIN_SECRETO = Symbol("sin-secreto");

function attempt(authorization: string | null, secret: string | typeof SIN_SECRETO = SECRET) {
  const headers = new Headers();
  if (authorization !== null) headers.set("authorization", authorization);
  const value = secret === SIN_SECRETO ? undefined : secret;
  return withSecret(value, () => requireAdminCapture(new Request("https://x/y", { method: "POST", headers })));
}

test("acepta el token correcto", () => {
  assert.equal(attempt(`Bearer ${SECRET}`), null);
});

test("acepta un espacio colado EN MEDIO del token", () => {
  // El caso real: el campo del panel externo parte el valor y se cuela un
  // espacio. El blanco no aporta entropia, asi que ignorarlo no debilita nada.
  const partido = `${SECRET.slice(0, 34)} ${SECRET.slice(34)}`;
  assert.equal(attempt(`Bearer ${partido}`), null);
});

test("acepta saltos de linea y espacios sobrantes alrededor", () => {
  assert.equal(attempt(`  Bearer ${SECRET}\n`), null);
});

test("rechaza un token distinto aunque mida lo mismo", () => {
  const otro = "b".repeat(64);
  const response = attempt(`Bearer ${otro}`);
  assert.notEqual(response, null);
  assert.equal(response?.status, 401);
});

test("rechaza un token al que le falta un caracter", () => {
  const response = attempt(`Bearer ${SECRET.slice(0, 63)}`);
  assert.equal(response?.status, 401);
});

test("rechaza cuando no hay cabecera", () => {
  assert.equal(attempt(null)?.status, 401);
});

test("rechaza sin el prefijo Bearer", () => {
  assert.equal(attempt(SECRET)?.status, 401);
});

test("es fail-closed si no hay secreto configurado", () => {
  assert.equal(attempt(`Bearer ${SECRET}`, SIN_SECRETO)?.status, 401);
});

test("es fail-closed si el secreto es demasiado corto", () => {
  assert.equal(attempt("Bearer corto", "corto")?.status, 401);
});
