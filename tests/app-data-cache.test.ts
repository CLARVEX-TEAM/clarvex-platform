import assert from "node:assert/strict";
import test from "node:test";
import { clearAppDataCache, fetchAppData } from "../lib/app-data";

/**
 * La cache del panel es lo que evita que cambiar de pantalla vacie la vista.
 * Su riesgo NO es mostrar un dato de hace veinte segundos: es que el celular
 * kiosko y las cuentas demo son COMPARTIDOS, asi que una entrada que sobreviva
 * al cierre de sesion le ensena a la siguiente persona los datos de la anterior.
 * Estas pruebas fijan justo eso.
 *
 * Cada prueba limpia primero: la cache vive en el modulo y se comparte entre
 * ellas, igual que se comparte entre pantallas en el navegador.
 */

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

test("la segunda navegacion no vuelve a pedir los datos", async () => {
  clearAppDataCache();
  const net = stubFetch({ users: [] });
  try {
    await fetchAppData();
    await fetchAppData();
    assert.equal(net.calls(), 1, "la segunda lectura debe salir de la cache");
  } finally { net.restore(); }
});

test("cerrar sesion tira la cache", async () => {
  clearAppDataCache();
  const net = stubFetch({ users: [] });
  try {
    await fetchAppData();
    assert.equal(net.calls(), 1);
    clearAppDataCache();
    await fetchAppData();
    assert.equal(net.calls(), 2, "tras limpiar hay que volver a pedir");
  } finally { net.restore(); }
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

test("devuelve exactamente lo que trajo la red", async () => {
  clearAppDataCache();
  const payload = { users: [{ id: "u1" }], kpis: [] };
  const net = stubFetch(payload);
  try {
    const primera = await fetchAppData();
    const segunda = await fetchAppData();
    assert.deepEqual(primera, payload);
    assert.equal(segunda, primera, "la cache devuelve el mismo objeto, no una copia distinta");
  } finally { net.restore(); }
});
