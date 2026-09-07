import assert from "node:assert/strict";
import test from "node:test";
import { huellaAOrigen, origenesAceptados, origenesDeAndroid } from "../lib/webauthn-origenes";

/*
 * Por qué existen estas pruebas.
 *
 * Dentro de la app de Android el origen de una huella NO es el dominio. Con el
 * WebView en modo `WEB_AUTHENTICATION_SUPPORT_FOR_APP` la peticion se enruta por
 * el Credential Manager y la respuesta llega firmada como
 * `android:apk-key-hash:...`. El servidor la rechazaba con «Unexpected
 * authentication response origin», que suena a ataque y era la app legitima.
 *
 * Lo que se protege aqui es la CONVERSION, y no es evidente:
 *
 *   assetlinks.json  ->  hexadecimal  de sha256(certificado)
 *   apk-key-hash     ->  base64url    de sha256(certificado)
 *
 * Son el mismo resumen escrito de dos formas. La primera version de esta funcion
 * le aplicaba OTRO sha256 a la huella --que ya es un resumen-- y producia un
 * valor que no corresponde a ninguna app. El sintoma habria sido el mismo error
 * de origen inesperado que esto vino a arreglar, y por eso el caso de abajo usa
 * el valor REAL que reporto el telefono, no uno inventado.
 */

// Medidos el 7 de septiembre de 2026 en el Pixel de la gerencia, con el APK
// firmado por la llave estable de Clarvex. Son el mismo certificado.
const HUELLA_REAL = "87:58:A3:26:97:E3:43:27:5C:E2:F1:1C:DF:22:65:C6:6E:35:15:AD:A1:6A:06:4D:04:0B:53:D0:9C:29:FF:BC";
const ORIGEN_REAL = "android:apk-key-hash:h1ijJpfjQydc4vEc3yJlxm41Fa2hagZNBAtT0Jwp_7w";

test("la huella del certificado da el origen que manda el telefono", () => {
  assert.equal(huellaAOrigen(HUELLA_REAL), ORIGEN_REAL);
});

test("da igual que la huella venga en minusculas o sin los dos puntos", () => {
  assert.equal(huellaAOrigen(HUELLA_REAL.toLowerCase()), ORIGEN_REAL);
  assert.equal(huellaAOrigen(HUELLA_REAL.replace(/:/g, "")), ORIGEN_REAL);
});

test("una huella que no lo es se rechaza en vez de inventar un origen", () => {
  // Un origen mal formado en la lista de confianza no falla: acepta algo que no
  // existe. Es mejor no tener el origen que tener uno equivocado.
  assert.equal(huellaAOrigen("no-es-una-huella"), null);
  assert.equal(huellaAOrigen("87:58:A3"), null);
  assert.equal(huellaAOrigen(""), null);
});

test("lee la app declarada en assetlinks.json", () => {
  const origenes = origenesDeAndroid();
  assert.ok(origenes.includes(ORIGEN_REAL), "el origen de la app tiene que salir del propio assetlinks.json");
  assert.equal(origenes.length, 1, "una llave viva, un origen");
});

test("el dominio va SIEMPRE y va primero", () => {
  const origenes = origenesAceptados("https://team.clarvex.tech");
  assert.equal(origenes[0], "https://team.clarvex.tech", "el navegador y la PWA no pueden depender de la app");
  assert.ok(origenes.includes(ORIGEN_REAL));
});

test("el origen de la app se DERIVA, no se acepta del cliente", () => {
  // La lista sale de nuestro archivo. Un origen que llegue en la respuesta solo
  // se compara contra esto; copiarlo del mensaje de error habria dejado entrar a
  // cualquier app que supiera pedirlo.
  const origenes = origenesAceptados("https://team.clarvex.tech");
  for (const o of origenes.slice(1)) {
    assert.match(o, /^android:apk-key-hash:[A-Za-z0-9_-]{43}$/);
  }
});
