import assert from "node:assert/strict";
import test from "node:test";
import { clearedSessionCookieHeader, SESSION_COOKIE } from "../lib/session-token";

/*
 * El bucle que encerraba a la gente fuera de su propia cuenta.
 *
 * El middleware solo verifica la FIRMA del token de sesión; el `sessionVersion`
 * lo comprueban los handlers contra la base. Cuando una sesión se revoca —por
 * logout, cambio de PIN o un cierre forzado desde la base— el token sigue
 * pareciéndole válido al middleware:
 *
 *   /advisor → /api/auth/session responde 401 → la app navega a /login
 *           → el middleware ve el token «válido» y la devuelve a /advisor → …
 *
 * Y no hay salida por el lado del cliente: la cookie es `httpOnly`, así que el
 * JavaScript de la app no puede borrarla. Tiene que expirarla el servidor en la
 * misma respuesta que niega.
 */

test("la cabecera de cierre expira la cookie de sesión", () => {
  const header = clearedSessionCookieHeader();

  assert.match(header, new RegExp(`^${SESSION_COOKIE}=;`), "debe vaciar el valor");
  // Las dos formas: `Max-Age` la entienden los navegadores modernos y `Expires`
  // cubre a los que lo ignoran. Con una sola, algún navegador conservaría la
  // cookie y el bucle seguiría vivo justo donde no podemos depurarlo.
  assert.match(header, /Max-Age=0/);
  assert.match(header, /Expires=Thu, 01 Jan 1970/);
  assert.match(header, /Path=\//, "sin Path=/ borraría otra cookie, no la de sesión");
  assert.match(header, /HttpOnly/);
});

test("la cabecera de cierre conserva los atributos que la hacen aplicable", () => {
  const header = clearedSessionCookieHeader();

  // `SameSite` tiene que coincidir con el de la cookie original (`lax`). Ese
  // valor no es cosmético: con `strict`, Android no manda la cookie al abrir la
  // PWA desde el ícono y la gente acababa en /login en cada arranque en frío.
  assert.match(header, /SameSite=Lax/);
});

test("fuera de producción la cabecera no exige Secure", () => {
  // Las pruebas corren con NODE_ENV=test. En local la app va por http, y una
  // cookie `Secure` no se borraría — el bucle sería imposible de reproducir
  // justo donde se depura.
  assert.equal(process.env.NODE_ENV, "test");
  assert.doesNotMatch(clearedSessionCookieHeader(), /Secure/);
});
