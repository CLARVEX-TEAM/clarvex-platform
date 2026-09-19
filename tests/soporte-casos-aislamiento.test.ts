import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/*
 * Por qué existe esta prueba.
 *
 * ⚠️ **Una etiqueta `store-xxx` dentro de un ticket de Zendesk NO es una
 * frontera de seguridad.** Es una etiqueta. Si el handler aceptara el id del
 * ticket que manda el cliente, cualquiera abriría el caso de otra persona
 * probando números --y un caso de soporte puede contener un problema con su
 * jefe, un tema de nómina o una queja.
 *
 * La regla: se busca la fila de `SupportCase` por su id **Y por su dueño**, y
 * solo entonces se usa su `zendeskId`. Esta prueba lee el código del handler y
 * comprueba la forma de esa consulta, que es lo que no puede relajarse sin que
 * alguien lo note.
 */

const HANDLER = "app/api/support/casos/[id]/route.ts";
const LISTA = "app/api/support/casos/route.ts";

function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("⚠️ el caso se busca por su DUENO, nunca por el id del ticket", () => {
  const fuente = sinComentarios(readFileSync(HANDLER, "utf8"));

  // La consulta filtra por usuario Y tienda, las dos.
  assert.match(fuente, /where:\s*\{\s*id,\s*userId,\s*storeId\s*\}/, "la consulta tiene que filtrar por dueño");

  // Y el id de Zendesk sale de la fila, no del cliente.
  assert.doesNotMatch(
    fuente,
    /zendeskId:\s*(Number|parseInt|params|body|searchParams)/,
    "el zendeskId nunca puede venir de la petición"
  );
});

test("⚠️ la lista tampoco ensena casos ajenos", () => {
  const fuente = sinComentarios(readFileSync(LISTA, "utf8"));
  assert.match(fuente, /userId:\s*session\.userId/, "la lista filtra por el usuario de la sesión");
  assert.match(fuente, /storeId:\s*session\.storeId/, "y por su tienda");
  /*
   * Ni gerencia ve los casos de su equipo: un caso de soporte puede ser sobre el
   * gerente. Si algún día se quiere un panel de tienda, que sea otra cosa.
   */
  assert.doesNotMatch(fuente, /isManager|GERENTE|role\s*===/, "aquí no se abre por rol");
});

test("⚠️ responder pasa por la guarda de idempotencia", () => {
  /*
   * Publicar un comentario NO es inofensivo de repetir: un reintento deja el
   * mismo mensaje dos veces en la conversación que lee soporte. Y reintentar es
   * exactamente lo que hace la cola cuando esto se escribe sin señal.
   */
  const fuente = sinComentarios(readFileSync(HANDLER, "utf8"));
  const post = fuente.slice(fuente.indexOf("export async function POST"));
  assert.match(post, /conIdempotencia/, "el POST tiene que ir dentro de la guarda");
  assert.match(post, /claveDeLaPeticion/);
});

test("⚠️ un caso RESUELTO no admite mas respuestas", () => {
  const fuente = sinComentarios(readFileSync(HANDLER, "utf8"));
  const post = fuente.slice(fuente.indexOf("export async function POST"));
  assert.match(post, /admiteRespuesta/, "se comprueba antes de publicar en Zendesk");
});

test("⚠️ cuando Zendesk no contesta NO se inventa el estado", () => {
  /*
   * Las dos formas de mentir aquí: decir «resuelto» sobre un caso abierto, o
   * dejar la pantalla vacía y hacer desaparecer el caso. Se enseña la última
   * copia y se declara `alDia: false`.
   */
  const fuente = sinComentarios(readFileSync(HANDLER, "utf8"));
  assert.match(fuente, /alDia:\s*false/, "tiene que declarar que no está al día");
  assert.match(fuente, /if\s*\(!ticket\s*\|\|\s*!comentarios\)/, "y detectar que Zendesk no contestó");
});
