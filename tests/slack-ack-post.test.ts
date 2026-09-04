import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * La confirmacion de alertas de Slack: que el GET no cambie estado.
 *
 * ⚠️ Se comprueba sobre el CODIGO y no sobre la ruta en marcha, porque montarla
 * exige Prisma y una base. Lo que importa aqui es estructural --que operacion
 * vive en que metodo-- y eso se puede afirmar leyendo el modulo. Las pruebas de
 * la firma y la expiracion del token ya viven en `slack-ops.test.ts`.
 */

const RUTA = join(process.cwd(), "app/api/webhooks/slack/ack/route.ts");
const CODIGO = readFileSync(RUTA, "utf8");

/** El cuerpo de una funcion exportada del modulo. */
function cuerpoDe(metodo: string): string {
  const inicio = CODIGO.indexOf(`export async function ${metodo}(`);
  assert.notEqual(inicio, -1, `no existe ${metodo}`);
  const siguiente = ["GET", "POST", "PUT", "DELETE"]
    .map((m) => CODIGO.indexOf(`export async function ${m}(`, inicio + 10))
    .filter((i) => i > inicio)
    .sort((a, b) => a - b)[0];
  return CODIGO.slice(inicio, siguiente === undefined ? CODIGO.length : siguiente);
}

test("⚠️ REGRESION: el GET no crea registros ni actualiza Slack", () => {
  /*
   * El fallo: el GET creaba el AuditLog y llamaba a `chat.update`. Slack
   * previsualiza los enlaces que se publican, y un antivirus de correo o la
   * precarga del navegador los abren solos. Cualquiera de esos marcaba la
   * alerta como revisada sin que nadie la revisara.
   */
  const get = cuerpoDe("GET");
  assert.equal(get.includes("auditLog.create"), false, "el GET no puede crear registros");
  assert.equal(get.includes("updateSlackOpsMessageReviewed"), false, "el GET no puede tocar Slack");
});

test("el GET si puede LEER, para saber si ya estaba revisada", () => {
  const get = cuerpoDe("GET");
  assert.ok(get.includes("auditLog.findFirst"), "leer no cambia nada y evita ofrecer un boton inutil");
});

test("el GET ofrece un formulario que manda POST", () => {
  const get = cuerpoDe("GET");
  assert.match(get, /method="POST"/);
  assert.match(get, /action="\/api\/webhooks\/slack\/ack"/);
});

test("⚠️ el POST es quien cambia estado", () => {
  const post = cuerpoDe("POST");
  assert.ok(post.includes("auditLog.create"));
  assert.ok(post.includes("updateSlackOpsMessageReviewed"));
});

test("⚠️ el POST valida la firma antes de tocar nada", () => {
  // Sin esto, cualquiera podria marcar alertas como revisadas mandando un POST.
  const post = cuerpoDe("POST");
  const posFirma = post.indexOf("verifySlackOpsAckToken");
  const posEscritura = post.indexOf("auditLog.create");
  assert.ok(posFirma > 0, "tiene que verificar el token");
  assert.ok(posFirma < posEscritura, "la verificacion va ANTES de escribir");
  assert.match(post, /if \(!payload\)[\s\S]{0,120}401/, "un token invalido responde 401");
});

test("⚠️ la idempotencia es transaccional, no por comprobar antes", () => {
  /*
   * Mirar si existe y despues insertar deja una carrera: dos peticiones a la
   * vez pasan las dos la comprobacion y crean dos registros. La transaccion
   * Serializable hace que la segunda choque, y esa colision se trata como «ya
   * estaba».
   */
  const post = cuerpoDe("POST");
  assert.match(post, /\$transaction/);
  assert.match(post, /isolationLevel:\s*"Serializable"/);
  assert.match(post, /catch/, "una colision de serializacion no puede tumbar la peticion");
});

test("⚠️ la identidad del actor NO se inventa", () => {
  /*
   * El token firmado demuestra que la alerta salio de Clarvex, no QUIEN pulso:
   * cualquiera con la URL puede mandarla. Poner un nombre ahi seria peor que no
   * ponerlo.
   */
  const post = cuerpoDe("POST");
  assert.match(post, /identidad no verificada/);
  assert.match(post, /actorVerificado:\s*false/);
});

test("los enlaces ya publicados siguen sirviendo", () => {
  // Llevan `?token=...` por GET. Siguen abriendo la pagina; solo añaden un clic.
  const get = cuerpoDe("GET");
  assert.match(get, /searchParams\.get\("token"\)/);
  // Y el POST tambien lo acepta por query, para no romper una integracion que
  // ya lo mande asi.
  assert.match(cuerpoDe("POST"), /searchParams\.get\("token"\)/);
});

test("la pagina no se indexa ni se cachea", () => {
  // La URL lleva un token firmado: no puede acabar en un buscador ni en un
  // cache intermedio.
  assert.match(CODIGO, /"Cache-Control": "no-store"/);
  assert.match(CODIGO, /noindex, nofollow/);
});

test("⚠️ el token se escapa antes de pintarlo en el HTML", () => {
  // Viene de la URL. Meterlo crudo en un `value=` es una inyeccion.
  assert.match(CODIGO, /function escapar/);
  assert.match(cuerpoDe("GET"), /value="\$\{escapar\(token\)\}"/);
});
