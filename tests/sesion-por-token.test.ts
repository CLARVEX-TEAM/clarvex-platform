import assert from "node:assert/strict";
import test from "node:test";
import {
  bearerToken,
  createSessionToken,
  pideTokenEnCuerpo,
  verifySessionToken,
  CLIENT_HEADER
} from "../lib/session-token";

/**
 * La sesión de la app nativa: el MISMO token, traído en la cabecera.
 *
 * ⚠️ Estas pruebas cubren la frontera que abre la app móvil. No es una función
 * de conveniencia: `middleware.ts` decide con ella si una petición a `/api/*`
 * pasa o recibe «Sesión requerida», así que un fallo aquí es una puerta abierta
 * o una app que no entra nunca.
 */

process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "clave-de-pruebas-con-mas-de-32-caracteres";

const persona = {
  id: "u-1",
  storeId: "TIENDA-1",
  role: "ASESOR" as const,
  name: "Waira",
  employeeNumber: "81893",
  sessionVersion: 3
};

/* ─── lectura de la cabecera ──────────────────────────────────────────────── */

test("lee el token de una cabecera Bearer bien formada", () => {
  assert.equal(bearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  // El esquema no distingue mayúsculas: los clientes lo escriben de las dos formas.
  assert.equal(bearerToken("bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(bearerToken("  Bearer   abc.def.ghi  "), "abc.def.ghi");
});

test("⚠️ no confunde otros esquemas ni cabeceras vacías con una sesión", () => {
  for (const cabecera of [null, undefined, "", "   ", "Basic dXNlcjpwYXNz", "Token abc", "Bearer", "Bearer   "]) {
    assert.equal(bearerToken(cabecera), null, `no debería aceptar «${String(cabecera)}»`);
  }
});

/* ─── ida y vuelta ────────────────────────────────────────────────────────── */

test("el token de la app es el MISMO que el de la cookie", async () => {
  /*
   * Es la propiedad que hace barato todo esto: no hay un segundo tipo de sesión.
   * Los claims viajan iguales, así que la revocación por `sessionVersion` y el
   * aislamiento por tienda siguen valiendo sin tocar nada más.
   */
  const token = await createSessionToken(persona);
  const sesion = await verifySessionToken(bearerToken(`Bearer ${token}`)!);

  assert.equal(sesion?.userId, "u-1");
  assert.equal(sesion?.storeId, "TIENDA-1");
  assert.equal(sesion?.role, "ASESOR");
  assert.equal(sesion?.sessionVersion, 3);
});

test("⚠️ un secreto que NO es un JWT no produce sesión", async () => {
  /*
   * Los cron y la captura externa también mandan `Authorization: Bearer`, con
   * `CRON_SECRET` o `ADMIN_CAPTURE_SECRET`. Esas rutas viven en la lista pública
   * del middleware y validan su secreto dentro del handler, así que no llegan
   * aquí — pero si alguna dejara de ser pública, el resultado tiene que ser
   * «sin sesión», nunca una sesión a medias ni una excepción.
   */
  for (const secreto of ["a".repeat(64), "no-es-un-jwt", "aaa.bbb.ccc"]) {
    assert.equal(await verifySessionToken(bearerToken(`Bearer ${secreto}`)!), null, secreto.slice(0, 12));
  }
});

test("⚠️ un token firmado con OTRO secreto se rechaza", async () => {
  const legitimo = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "otra-clave-distinta-de-al-menos-32-caracteres";
  const ajeno = await createSessionToken(persona);
  process.env.AUTH_SECRET = legitimo;

  assert.equal(await verifySessionToken(ajeno), null);
});

/* ─── quién recibe el token en el cuerpo ──────────────────────────────────── */

test("⚠️ el token NO viaja en el cuerpo salvo que el cliente lo pida", () => {
  /*
   * La cookie es `httpOnly` para que el JavaScript de la página no pueda leerla.
   * Si el login devolviera el token en el JSON siempre, cualquier script
   * inyectado en la web se lo llevaría y esa protección dejaría de existir.
   */
  assert.equal(pideTokenEnCuerpo(new Headers()), false);
  assert.equal(pideTokenEnCuerpo(new Headers({ [CLIENT_HEADER]: "web" })), false);
  assert.equal(pideTokenEnCuerpo(new Headers({ [CLIENT_HEADER]: "" })), false);
  // Un navegador normal no manda esta cabecera nunca.
  assert.equal(pideTokenEnCuerpo(new Headers({ "user-agent": "Mozilla/5.0" })), false);
});

test("la app nativa sí lo pide, y se le reconoce sin importar el formato", () => {
  assert.equal(pideTokenEnCuerpo(new Headers({ [CLIENT_HEADER]: "movil" })), true);
  assert.equal(pideTokenEnCuerpo(new Headers({ [CLIENT_HEADER]: "  MOVIL  " })), true);
});
