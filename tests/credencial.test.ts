import assert from "node:assert/strict";
import test from "node:test";
import { comoSeDice, estadoDeCredencial, firmarCredencial, leerCredencial } from "../lib/credencial";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **La página de verificación la puede abrir CUALQUIERA con el enlace.** No
 * pide sesión — ese es el punto: supervisión de AXO, el centro comercial o un
 * proveedor tienen que poder comprobar con la cámara. Eso la convierte en la
 * única superficie pública que habla de personas, y ahí un fallo no se nota: una
 * credencial falsa que verifica se ve exactamente igual que una buena.
 */

const ORIGINAL = process.env.AUTH_SECRET;
process.env.AUTH_SECRET = "secreto-de-prueba-suficientemente-largo-000";

const MANANA = Math.floor(Date.now() / 1000) + 86_400;
const AYER = Math.floor(Date.now() / 1000) - 86_400;
const datos = { u: "user-1", s: "tienda-1", exp: MANANA };

test("lo que se firma se vuelve a leer igual", () => {
  assert.deepEqual(leerCredencial(firmarCredencial(datos)), datos);
});

test("⚠️ un token MANIPULADO no se lee", () => {
  const bueno = firmarCredencial(datos);
  const [cuerpo, firma] = bueno.split(".") as [string, string];

  // Cambiar a quién acredita, conservando la firma.
  const otroCuerpo = Buffer.from(JSON.stringify({ ...datos, u: "user-2" })).toString("base64url");
  assert.equal(leerCredencial(`${otroCuerpo}.${firma}`), null, "no vale acreditar a otra persona");

  // Alargar la vigencia.
  const masLargo = Buffer.from(JSON.stringify({ ...datos, exp: MANANA + 999_999 })).toString("base64url");
  assert.equal(leerCredencial(`${masLargo}.${firma}`), null, "no vale estirar la vigencia");

  // Firma retocada.
  assert.equal(leerCredencial(`${cuerpo}.${firma.slice(0, -2)}AA`), null);
});

test("⚠️ nada de lo que llegue por la URL puede LANZAR", () => {
  /*
   * Esto viene de un QR que escanea un desconocido. Una excepción aquí tumbaría
   * la única página pública de la app.
   */
  for (const basura of ["", ".", "a.b", "sinpunto", "a".repeat(5000), "%%%.%%%", "eyJ9.x"]) {
    assert.equal(leerCredencial(basura), null, `«${basura.slice(0, 20)}» no puede pasar`);
  }
  assert.equal(leerCredencial(null as unknown as string), null);
  assert.equal(leerCredencial(123 as unknown as string), null);
});

test("⚠️ una BAJA deja de verificar al instante, aunque el QR siga vigente", () => {
  /*
   * Si bastara con la firma, la credencial de quien se fue seguiría valiendo
   * hasta caducar — hasta un mes. Por eso se comprueba contra la base en cada
   * consulta y no solo el token.
   */
  assert.equal(
    estadoDeCredencial({ datos, activo: false, mismaTienda: true }),
    "baja"
  );
});

test("⚠️ «caducada» y «baja» se dicen DISTINTO", () => {
  /*
   * Un enlace viejo de alguien que sigue trabajando se arregla abriendo la app.
   * Alguien que ya no trabaja ahí es otra cosa, y quien verifica necesita
   * distinguirlas.
   */
  assert.equal(estadoDeCredencial({ datos: { ...datos, exp: AYER }, activo: true, mismaTienda: true }), "caducada");
  assert.equal(comoSeDice("caducada").tono, "aviso");
  assert.equal(comoSeDice("baja").tono, "malo");
  assert.match(comoSeDice("baja").texto, /ya no trabaja/);
});

test("un traslado no sigue acreditando en la tienda anterior", () => {
  assert.equal(estadoDeCredencial({ datos, activo: true, mismaTienda: false }), "invalida");
});

test("una credencial buena y vigente verifica", () => {
  assert.equal(estadoDeCredencial({ datos, activo: true, mismaTienda: true }), "vigente");
  assert.equal(comoSeDice("vigente").tono, "bien");
});

test("sin token no se inventa un estado", () => {
  assert.equal(estadoDeCredencial({ datos: null, activo: true, mismaTienda: true }), "invalida");
});

test("⚠️ la llave es DERIVADA, no `AUTH_SECRET` en crudo", () => {
  /*
   * Firmar dos cosas distintas con la misma llave permite que una firma válida
   * para una valga para la otra el día que los formatos se parezcan. Se
   * comprueba indirectamente: el HMAC crudo del cuerpo NO es una firma válida.
   */
  const { createHmac } = require("node:crypto") as typeof import("node:crypto");
  const cuerpo = firmarCredencial(datos).split(".")[0]!;
  const conElSecretoCrudo = createHmac("sha256", process.env.AUTH_SECRET!).update(cuerpo).digest("base64url");
  assert.equal(leerCredencial(`${cuerpo}.${conElSecretoCrudo}`), null);
});

test("sin AUTH_SECRET no se firma nada", () => {
  // Mejor no emitir credenciales que emitirlas con una llave vacía, que
  // cualquiera podría reproducir.
  const previo = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "corto";
  assert.throws(() => firmarCredencial(datos), /AUTH_SECRET/);
  assert.equal(leerCredencial("a.b"), null, "y leer tampoco revienta");
  process.env.AUTH_SECRET = previo;
});

test.after(() => {
  if (ORIGINAL === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL;
});
