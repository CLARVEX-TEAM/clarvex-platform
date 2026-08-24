import assert from "node:assert/strict";
import test from "node:test";
import { getSession } from "../lib/auth";

/*
 * Por qué existen estas pruebas.
 *
 * `getSession` tenía un solo `fetch` sin red de seguridad. Cuando la petición
 * ni siquiera salía —señal intermitente, o el navegador abortándola al reanudar
 * la PWA desde segundo plano— la promesa se rechazaba, nadie la atrapaba y
 * `/advisor` se quedaba en esqueletos para siempre.
 *
 * La invariante que se protege aquí es la que puede hacer daño de verdad:
 * **un fallo de red NO puede devolverse como «no hay sesión»**. Si se
 * confundieran, un bache de señal sacaría al login a gente con sesión válida.
 */

const realFetch = global.fetch;

function stubFetch(responder: (attempt: number) => Promise<Response>) {
  let attempt = 0;
  const calls = { count: 0 };
  global.fetch = ((..._args: unknown[]) => {
    calls.count += 1;
    attempt += 1;
    return responder(attempt);
  }) as typeof fetch;
  return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test.afterEach(() => {
  global.fetch = realFetch;
});

test("getSession reintenta cuando la red falla y se recupera sola", async () => {
  const calls = stubFetch((attempt) =>
    attempt < 3
      ? Promise.reject(new TypeError("Failed to fetch"))
      : Promise.resolve(jsonResponse({ user: { id: "u1", name: "ITZEL" } }))
  );

  const session = await getSession();

  assert.equal(calls.count, 3);
  assert.equal(session?.id, "u1");
});

test("getSession LANZA si no logró preguntar; nunca devuelve null por red", async () => {
  const calls = stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

  // `null` significaría «el servidor dice que no hay sesión» y mandaría al
  // login a quien sí la tiene. Tiene que lanzar.
  await assert.rejects(() => getSession(), /No se pudo verificar la sesión|Failed to fetch/);
  assert.equal(calls.count, 3);
});

test("getSession NO reintenta cuando el servidor contesta que no", async () => {
  const calls = stubFetch(() => Promise.resolve(jsonResponse({ error: "no autorizado" }, 401)));

  const session = await getSession();

  // Repetir un 401 no lo va a convertir en sesión válida, y retrasaría el envío
  // al login tres veces por nada.
  assert.equal(session, null);
  assert.equal(calls.count, 1);
});
