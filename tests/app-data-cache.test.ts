import assert from "node:assert/strict";
import test from "node:test";

/**
 * La cache del panel es lo que evita que cambiar de pantalla vacie la vista y
 * lo que sostiene la pantalla cuando se cae la senal.
 *
 * Su riesgo NO es mostrar un dato de hace un rato: es que el celular kiosko y
 * las cuentas demo son COMPARTIDOS, asi que una copia que sobreviva al cierre
 * de sesion le ensena a la siguiente persona los datos de la anterior. Y ahora
 * la copia vive en el DISPOSITIVO, o sea que sobrevive tambien a cerrar la app.
 */

// Node no trae `window`. El modulo guarda en `window.localStorage`, asi que sin
// este sustituto la parte de disco no se ejercitaria: los accesos lanzarian,
// quedarian atrapados en el catch y las pruebas pasarian sin probar nada.
//
// Las claves se guardan como propiedades del propio objeto y los tres metodos
// se definen NO enumerables, para que `Object.keys(localStorage)` —que es como
// el modulo recorre lo guardado al cerrar sesion— devuelva solo los datos.
const store: Record<string, string> = {};
Object.defineProperties(store, {
  getItem: { value: (k: string) => (k in store ? store[k] : null) },
  setItem: { value: (k: string, v: string) => { store[k] = v; } },
  removeItem: { value: (k: string) => { delete store[k]; } }
});
(globalThis as { window?: unknown }).window = { localStorage: store };

// Import estatico: el modulo solo toca `window.localStorage` dentro de sus
// funciones, no al cargarse, asi que basta con que el sustituto exista antes de
// llamarlas.
import { clearAppDataCache, fetchAppData, lastKnownAppData } from "../lib/app-data";

type Fetch = typeof globalThis.fetch;

function stubFetch(payload: unknown) {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => payload } as unknown as Response;
  }) as Fetch;
  return { calls: () => calls, restore: () => { globalThis.fetch = original; } };
}

function stubOffline() {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("sin red"); }) as Fetch;
  return { restore: () => { globalThis.fetch = original; } };
}

test("la segunda navegacion no vuelve a pedir los datos", async () => {
  clearAppDataCache();
  const net = stubFetch({ users: [] });
  try {
    await fetchAppData();
    await fetchAppData();
    assert.equal(net.calls(), 1, "la segunda lectura debe salir de la cache");
  } finally { net.restore(); }
});

test("cerrar sesion tira la cache, tambien la del dispositivo", async () => {
  clearAppDataCache();
  const net = stubFetch({ users: [{ id: "u1" }] });
  try {
    await fetchAppData();
    assert.notEqual(lastKnownAppData(), null, "quedo guardada");
  } finally { net.restore(); }

  clearAppDataCache();
  assert.equal(lastKnownAppData(), null, "tras cerrar sesion no queda rastro");
  assert.equal(Object.keys(store).length, 0, "ni en el dispositivo");
});

test("las variantes NO comparten entrada", async () => {
  // `includeInactive` devuelve tambien a la gente dada de baja. Compartir
  // entrada colaria bajas en pantallas que solo deben ver gente activa.
  clearAppDataCache();
  const net = stubFetch({ users: [] });
  try {
    await fetchAppData();
    await fetchAppData({ includeInactive: true });
    assert.equal(net.calls(), 2, "cada variante pide por separado");
    await fetchAppData();
    await fetchAppData({ includeInactive: true });
    assert.equal(net.calls(), 2, "y cada una conserva su propia entrada");
  } finally { net.restore(); }
});

test("sin red sirve la ultima copia en vez de fallar", async () => {
  // Es lo que sostiene la pantalla al perder senal: los datos de la ultima
  // conexion valen mas que un error, y el aviso de "sin conexion" ya advierte.
  clearAppDataCache();
  const guardado = { users: [{ id: "u1" }] };
  const net = stubFetch(guardado);
  try { await fetchAppData(); } finally { net.restore(); }

  // Se vacia SOLO la memoria, dejando la copia del dispositivo: es el estado
  // real tras cerrar y reabrir la app.
  const copia = store["clarvex-app-data-v1:active"];
  clearAppDataCache();
  store["clarvex-app-data-v1:active"] = copia!;

  const offline = stubOffline();
  try {
    assert.deepEqual(await fetchAppData(), guardado);
  } finally { offline.restore(); }
});

test("sin copia y sin red, si falla", async () => {
  // No se inventa nada: si nunca hubo conexion, el error es la respuesta
  // correcta y la pantalla debe ofrecer reintentar.
  clearAppDataCache();
  const offline = stubOffline();
  try {
    await assert.rejects(() => fetchAppData());
  } finally { offline.restore(); }
});
