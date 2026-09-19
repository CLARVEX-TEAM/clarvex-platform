import assert from "node:assert/strict";
import test from "node:test";
import { bedrockDisponible, credencialesBedrock, opcionesDeCliente } from "../lib/bedrock-credenciales";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Borrar el usuario IAM `clarvex-bedrock` sin esto rompe producción en
 * silencio.** Los dos módulos de Bedrock exigían las llaves del `.env` y, sin
 * ellas, devuelven «sin credenciales»: el lector del POS se cae a Gemini --más
 * lento, pero funciona-- y el reconocimiento de zonas del visual se queda sin
 * nada, porque no tiene respaldo. Nadie vería un error; el bot dejaría de
 * proponer el reparto y ya.
 *
 * ⚠️ Y al revés: si el rol se activara SOLO por faltar las llaves, cualquier
 * máquina de desarrollo sin `.env` se pondría a buscar credenciales que no
 * existen y a comerse los tiempos de espera del SDK, en vez de decir que
 * Bedrock no está configurado.
 *
 * El módulo lee `process.env` al llamarse, así que se puede probar moviéndolo.
 */

const ORIGINAL = { ...process.env };

function conEntorno<T>(env: Record<string, string | undefined>, hacer: () => T): T {
  for (const clave of ["BEDROCK_ACCESS_KEY_ID", "BEDROCK_SECRET_ACCESS_KEY", "BEDROCK_USE_INSTANCE_ROLE"]) {
    delete process.env[clave];
  }
  for (const [clave, valor] of Object.entries(env)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
  try {
    return hacer();
  } finally {
    for (const clave of ["BEDROCK_ACCESS_KEY_ID", "BEDROCK_SECRET_ACCESS_KEY", "BEDROCK_USE_INSTANCE_ROLE"]) {
      if (ORIGINAL[clave] === undefined) delete process.env[clave];
      else process.env[clave] = ORIGINAL[clave];
    }
  }
}

test("con las llaves del .env se usan las llaves, como hasta hoy", () => {
  const credenciales = conEntorno(
    { BEDROCK_ACCESS_KEY_ID: "AKIA-ficticia", BEDROCK_SECRET_ACCESS_KEY: "secreta-ficticia" },
    () => credencialesBedrock()
  );
  assert.equal(credenciales?.modo, "llaves");
  assert.deepEqual(
    opcionesDeCliente({ modo: "llaves", accessKeyId: "a", secretAccessKey: "b" }),
    { credentials: { accessKeyId: "a", secretAccessKey: "b" } }
  );
});

test("⚠️ sin llaves y SIN pedir el rol, Bedrock NO esta configurado", () => {
  /*
   * Este es el candado que evita que una máquina de desarrollo se quede
   * esperando al SDK. Faltar las llaves no autoriza a buscar un rol.
   */
  assert.equal(conEntorno({}, () => credencialesBedrock()), null);
  assert.equal(conEntorno({}, () => bedrockDisponible()), false);
});

test("⚠️ con el rol pedido EXPLICITAMENTE se omite `credentials`", () => {
  /*
   * Omitirlo es como se le dice al SDK que use su cadena por omisión, que es
   * donde encuentra el rol de la instancia. Mandar un objeto vacío o unas
   * cadenas vacías NO vale: el SDK las tomaría por credenciales y firmaría con
   * ellas, y el fallo saldría como «no autorizado» y no como «no configurado».
   */
  const credenciales = conEntorno({ BEDROCK_USE_INSTANCE_ROLE: "1" }, () => credencialesBedrock());
  assert.equal(credenciales?.modo, "rol");

  const opciones = opcionesDeCliente({ modo: "rol" });
  assert.deepEqual(opciones, {});
  assert.equal("credentials" in opciones, false, "la clave no puede ni existir");
});

test("las llaves mandan sobre el rol, para poder volver atras sin tocar dos sitios", () => {
  const env = {
    BEDROCK_ACCESS_KEY_ID: "AKIA-ficticia",
    BEDROCK_SECRET_ACCESS_KEY: "secreta-ficticia",
    BEDROCK_USE_INSTANCE_ROLE: "1"
  };
  assert.equal(conEntorno(env, () => credencialesBedrock())?.modo, "llaves");
});

test("media configuracion no es configuracion", () => {
  // Una sola llave no sirve para firmar, y tomarla por buena daría un «no
  // autorizado» en vez de un «no configurado».
  assert.equal(conEntorno({ BEDROCK_ACCESS_KEY_ID: "AKIA-ficticia" }, () => credencialesBedrock()), null);
});
