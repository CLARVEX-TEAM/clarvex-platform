import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/*
 * Por qué existen estas pruebas.
 *
 * `assetlinks.json` es lo que autoriza a la app de Android a actuar en nombre de
 * `team.clarvex.tech`. De el depende el acceso por huella dentro de la app, y
 * cuando esta mal **no avisa de nada util**: Android falla con «An unknown error
 * occurred while talking to the credential manager», que no menciona ni el
 * archivo ni el dominio. Se perdio un rato averiguando eso.
 *
 * Es un archivo estatico, sin tipos y sin nadie que lo compile, asi que una coma
 * de mas o una relacion mal escrita pasa hasta produccion sin tocar ninguna
 * puerta. Esto es esa puerta.
 *
 * ⚠️ Lo que NO se puede comprobar aqui es que la huella sea la de la llave que
 * firma de verdad: la llave vive en otro repositorio y en los secretos de
 * Actions. Eso se comprueba a mano al cambiarla, y esta escrito en LEEME.md.
 */

const RUTA = "public/.well-known/assetlinks.json";
const PAQUETE = "tech.clarvex.team";

type Entrada = {
  relation?: string[];
  target?: { namespace?: string; package_name?: string; sha256_cert_fingerprints?: string[] };
};

function leer(): Entrada[] {
  return JSON.parse(readFileSync(RUTA, "utf8")) as Entrada[];
}

test("es JSON valido y una lista", () => {
  const contenido = leer();
  assert.ok(Array.isArray(contenido), "Android espera una LISTA, no un objeto");
  assert.ok(contenido.length > 0);
});

test("declara la app de Clarvex", () => {
  const nuestra = leer().find((e) => e.target?.package_name === PAQUETE);
  assert.ok(nuestra, `tiene que haber una entrada para ${PAQUETE}`);
  assert.equal(nuestra.target?.namespace, "android_app");
});

test("incluye la relacion de CREDENCIALES, que es la de la huella", () => {
  // ⚠️ `handle_all_urls` es para abrir enlaces en la app y NO sirve para
  // WebAuthn. El archivo vivio meses con solo esa, heredada de un intento de
  // TWA, y por eso la huella fallaba dentro del contenedor.
  const nuestra = leer().find((e) => e.target?.package_name === PAQUETE);
  assert.ok(
    nuestra?.relation?.includes("delegate_permission/common.get_login_creds"),
    "sin get_login_creds, el Credential Manager rechaza la huella"
  );
});

test("las huellas tienen forma de SHA-256 en mayusculas y con dos puntos", () => {
  // Android compara la cadena tal cual. Una huella en minusculas, sin los dos
  // puntos o con espacios NO casa, y el fallo se ve igual que si faltara.
  const huellas = leer().flatMap((e) => e.target?.sha256_cert_fingerprints ?? []);
  assert.ok(huellas.length > 0, "sin huella no autoriza a nadie");
  for (const h of huellas) {
    assert.match(h, /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/, `huella con formato invalido: ${h.slice(0, 24)}...`);
  }
});

test("no quedan huellas de mas", () => {
  // ⚠️ Cada huella de aqui AUTORIZA a quien tenga esa llave a presentarse como
  // la app de Clarvex ante este dominio. Habia una de un TWA abandonado de julio
  // de 2026, cuya llave ya no existe ni se sabe donde acabo. Una sola, la que
  // firma hoy.
  const huellas = leer().flatMap((e) => e.target?.sha256_cert_fingerprints ?? []);
  assert.equal(huellas.length, 1, "una huella por llave viva; retirar las que ya no firman nada");
});
