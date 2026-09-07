import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { firmarDescarga, verificarDescarga } from "../lib/apk-descarga";
import { rutaDelApk } from "../lib/version-app";

/*
 * Por qué existen estas pruebas.
 *
 * El APK es el binario de la app de la tienda y se sirve por una ruta que NO
 * pide sesion: quien descarga es el descargador nativo de Android, que va por
 * fuera del WebView y no lleva la cookie. Toda la autorizacion vive entonces en
 * un token firmado, asi que lo que aqui se protege es que ese token sea de
 * verdad un candado y no un adorno.
 *
 * ⚠️ Y que la ruta siga siendo la EXACTA en el middleware: si alguien pusiera el
 * prefijo `/api/app/`, `/api/app/version` dejaria de pedir sesion y el token se
 * lo daria a cualquiera. El candado se abriria solo.
 */

const SECRETO_ORIGINAL = process.env.AUTH_SECRET;

test.before(() => {
  process.env.AUTH_SECRET = "secreto-de-pruebas-con-mas-de-32-caracteres";
});
test.after(() => {
  if (SECRETO_ORIGINAL === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = SECRETO_ORIGINAL;
});

test("un token recien firmado vale, y dice para quien y para que version", async () => {
  const token = await firmarDescarga("usuario-1", 7);
  const permiso = await verificarDescarga(token);
  assert.deepEqual(permiso, { userId: "usuario-1", versionCode: 7 });
});

test("un token manipulado no vale", async () => {
  const token = await firmarDescarga("usuario-1", 7);
  // Se cambia un caracter de la firma.
  const roto = token.slice(0, -2) + (token.endsWith("a") ? "b" : "a");
  assert.equal(await verificarDescarga(roto), null);
});

test("basura no vale, y NO revienta", async () => {
  // Un token corrupto es una peticion invalida, no un error del servidor: si
  // lanzara, la ruta devolveria 500 y se veria como una caida.
  for (const basura of ["", "no-es-un-token", "a.b.c", "null"]) {
    assert.equal(await verificarDescarga(basura), null);
  }
});

test("un token firmado con OTRO secreto no vale", async () => {
  const token = await firmarDescarga("usuario-1", 7);
  process.env.AUTH_SECRET = "otro-secreto-distinto-de-mas-de-32-caracteres";
  try {
    assert.equal(await verificarDescarga(token), null);
  } finally {
    process.env.AUTH_SECRET = "secreto-de-pruebas-con-mas-de-32-caracteres";
  }
});

test("un token de SESION no sirve para descargar", async () => {
  // ⚠️ Los dos se firman con AUTH_SECRET. Lo que los separa es el `aud`: sin
  // esa comprobacion, una cookie de sesion robada bajaria el binario, y al
  // reves un enlace de descarga valdria como sesion.
  const { SignJWT } = await import("jose/jwt/sign");
  const sesion = await new SignJWT({ userId: "usuario-1" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("usuario-1")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  assert.equal(await verificarDescarga(sesion), null);
});

test("un token caducado no vale", async () => {
  const { SignJWT } = await import("jose/jwt/sign");
  const viejo = Math.floor(Date.now() / 1000) - 7200;
  const caducado = await new SignJWT({ v: 7 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("usuario-1")
    .setAudience("clarvex:apk")
    .setIssuedAt(viejo)
    .setExpirationTime(viejo + 600)
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  assert.equal(await verificarDescarga(caducado), null);
});

test("el nombre del archivo no puede escapar de su carpeta", async () => {
  // ⚠️ Lo que se comprueba es la CONTENCION, no que la cadena no lleve puntos:
  // "../../etc/passwd" acaba como "......etcpasswd", que tiene puntos y es
  // inofensivo. La pregunta correcta es si la ruta resultante sigue DENTRO.
  const { dirname, resolve } = await import("node:path");
  const carpeta = dirname(rutaDelApk("referencia.apk"));
  // La segunda lleva separadores de Windows: un manifiesto escrito en otra
  // maquina puede traerlos, y `join` los interpreta igual.
  for (const intento of ["../../../etc/passwd", "..\\..\\.env", "sub/dir/app.apk"]) {
    assert.equal(dirname(resolve(rutaDelApk(intento))), resolve(carpeta), `se escapo con: ${intento}`);
  }
});

test("un nombre de puros puntos se rechaza en vez de construir una ruta rara", () => {
  for (const intento of ["..", "../..", "/", ""]) {
    assert.throws(() => rutaDelApk(intento), /inv[aá]lido/i, `deberia rechazar: ${intento}`);
  }
});

test("la descarga esta listada por ruta EXACTA, no por prefijo", () => {
  // Si alguien cambiara esto por `startsWith("/api/app/")`, `/api/app/version`
  // dejaria de pedir sesion y repartiria el token de descarga a cualquiera.
  const middleware = readFileSync("middleware.ts", "utf8");
  assert.match(middleware, /"\/api\/app\/apk"/, "la ruta del APK va en la lista exacta");
  assert.ok(
    !/startsWith\("\/api\/app\//.test(middleware),
    "el prefijo /api/app/ NO puede ser publico: dejaria /api/app/version sin sesion"
  );
});
