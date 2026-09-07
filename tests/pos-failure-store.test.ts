import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, rmdir, stat, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPosFailureStore, decodePosDocument } from "../lib/pos-failure-store";

const input = {
  storeId: "TEST-STORE-A", mimeType: "application/pdf" as const, stage: "vision" as const,
  error: "Cuentas incompatibles", documentBase64: Buffer.from("%PDF-original sintético\u0000\n").toString("base64"),
  attempts: [{ provider: "gemini" as const, model: "sintético", startedAt: "2026-09-06T00:00:00.000Z", durationMs: 120,
    text: '{"net":-123.45}', accepted: false, textTruncated: false, problem: "Cuentas incompatibles" }]
};
async function fixture(t: TestContext, options: { maxRecords?: number; maxBytes?: number } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "clarvex-pos-history-test-"));
  t.after(async () => {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("clarvex-pos-history-test-"));
    await rm(directory, { recursive: true, force: true });
  });
  let now = Date.now();
  const store = createPosFailureStore({ directory: path.join(directory, "private"), now: () => now, ...options });
  return { directory, store, advance: (ms: number) => { now += ms; } };
}

test("historial POS: conserva bytes originales, salida de IA y causa, sin inventar actor", async t => {
  const { directory, store } = await fixture(t);
  const id = await store.save(input);
  const record = await store.read(id);
  assert.ok(record);
  assert.deepEqual(decodePosDocument(record.documentBase64), Buffer.from(input.documentBase64, "base64"));
  assert.equal(record.sha256, createHash("sha256").update(Buffer.from(input.documentBase64, "base64")).digest("hex"));
  assert.deepEqual(record.attempts, input.attempts);
  assert.equal(record.actorVerified, false);
  assert.deepEqual(await readdir(path.join(directory, "private")), [`${id}.json`]);
  if (process.platform !== "win32") {
    assert.equal((await stat(path.join(directory, "private"))).mode & 0o777, 0o700);
    assert.equal((await stat(path.join(directory, "private", `${id}.json`))).mode & 0o777, 0o600);
  }
});

test("historial POS: lista por tienda sin devolver original ni texto del modelo", async t => {
  const { store } = await fixture(t);
  await store.save(input);
  await store.save({ ...input, storeId: "TEST-STORE-B" });
  const entries = await store.list("TEST-STORE-A");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].storeId, "TEST-STORE-A");
  assert.ok(!JSON.stringify(entries).includes(input.documentBase64));
  assert.ok(!JSON.stringify(entries).includes("attempts"));
  assert.equal((await store.list("TEST-AUSENTE")).length, 0);
});

test("historial POS: el original caduca a siete días aunque nadie ejecute la limpieza", async t => {
  const f = await fixture(t);
  const id = await f.store.save(input);
  f.advance(7 * 86400000);
  assert.equal(await f.store.read(id), null);
  assert.deepEqual(await f.store.list(), []);
  await f.store.prune();
  assert.deepEqual(await readdir(path.join(f.directory, "private")), []);
});

test("historial POS: elimina el más antiguo para conservar el límite de casos", async t => {
  const f = await fixture(t, { maxRecords: 2 });
  const first = await f.store.save(input);
  f.advance(10);
  const second = await f.store.save(input);
  f.advance(10);
  const third = await f.store.save(input);
  assert.equal(await f.store.read(first), null);
  assert.ok(await f.store.read(second));
  assert.ok(await f.store.read(third));
});

test("historial POS: cuota de bytes y escrituras concurrentes no dejan archivos parciales", async t => {
  const f = await fixture(t, { maxBytes: 3500 });
  const ids = await Promise.all(Array.from({ length: 4 }, () => f.store.save(input)));
  assert.equal(new Set(ids).size, 4);
  const directory = path.join(f.directory, "private");
  const names = await readdir(directory);
  const sizes = await Promise.all(names.map(name => stat(path.join(directory, name))));
  assert.ok(sizes.reduce((sum, s) => sum + s.size, 0) <= 3500);
  assert.ok(names.every(name => name.endsWith(".json")));
  for (const entry of await f.store.list()) assert.ok(await f.store.read(entry.id));
});

test("historial POS: fichero excesivo se rechaza sin borrar los existentes", async t => {
  const f = await fixture(t, { maxBytes: 1800 });
  const id = await f.store.save(input);
  await assert.rejects(f.store.save({ ...input, documentBase64: Buffer.alloc(2000).toString("base64") }), /grande/);
  assert.ok(await f.store.read(id));
});

test("historial POS: no sigue rutas de usuario ni sirve originales modificados", async t => {
  const f = await fixture(t);
  const id = await f.store.save(input);
  assert.equal(await f.store.read("../../.env"), null);
  assert.equal(await f.store.read(id + "/../../.env"), null);
  const filename = path.join(f.directory, "private", `${id}.json`);
  const record = JSON.parse(await readFile(filename, "utf8"));
  record.documentBase64 = Buffer.from("otro documento").toString("base64");
  await writeFile(filename, JSON.stringify(record));
  await assert.rejects(f.store.read(id), /huella/);
});

test("historial POS: nunca usa el checkout ni una ruta relativa para guardar fotos", async () => {
  assert.throws(() => createPosFailureStore({ directory: "public/private" }), /absoluta/);
  const unsafe = createPosFailureStore({ directory: path.join(process.cwd(), "public", "pos-diagnostics-test") });
  await assert.rejects(unsafe.save(input), /fuera del proyecto/);
});

test("historial POS: bloqueo ocupado informa fallo y conserva archivos ajenos", async t => {
  const f = await fixture(t);
  await f.store.save(input);
  await mkdir(path.join(f.directory, "private", ".writer-lock"));
  await assert.rejects(f.store.save(input), /ocupado/);
  await writeFile(path.join(f.directory, "private", "ajeno.txt"), "conservar");
  await rmdir(path.join(f.directory, "private", ".writer-lock"));
  f.advance(8 * 86400000);
  await f.store.prune();
  assert.equal(await readFile(path.join(f.directory, "private", "ajeno.txt"), "utf8"), "conservar");
});

test("historial POS: no sigue una carpeta privada sustituida por un enlace", async t => {
  const f = await fixture(t);
  const target = path.join(f.directory, "target");
  await mkdir(target);
  await symlink(target, path.join(f.directory, "private"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(f.store.save(input), /privada/);
  assert.deepEqual(await readdir(target), []);
});

test("historial POS: base64 corrupto no se presenta como original recuperable", () => {
  for (const invalid of ["", "%%%", "a", "abc=def", "ab=="]) assert.throws(() => decodePosDocument(invalid), /inválido/);
  assert.equal(decodePosDocument("cHJ1ZWJh").toString(), "prueba");
});
