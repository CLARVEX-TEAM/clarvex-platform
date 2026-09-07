import assert from "node:assert/strict";
import test from "node:test";
import { avisoDescartado, guardarTokenNativo, recordarDescarte, saveSubscription } from "../components/PwaRegister";

/*
 * Por qué existen estas pruebas.
 *
 * `PwaRegister` se monta en el LAYOUT RAÍZ, así que también corre en `/login`,
 * donde todavía no hay sesión. Y el login navega con `router.replace`, que es
 * navegación de cliente: el layout NO se remonta y el efecto no vuelve a
 * ejecutarse.
 *
 * En la primera instalación eso significaba que el aparato conseguía su token
 * en la pantalla de acceso, el `POST` volvía **401** y el token se perdía. La
 * app no recibía nada hasta el SIGUIENTE arranque --justo cuando la persona
 * acaba de conceder el permiso y espera que funcione-- y sin un solo error a la
 * vista. En el camino web era peor: la respuesta ni se miraba.
 *
 * Lo que se protege aquí es la distinción que hace posible el reintento:
 *
 *   401  -> "todavía no hay sesión", se conserva para reintentar
 *   todo lo demás -> no se insiste
 *
 * Confundirlas rompe por los dos lados: dar el 401 por bueno pierde el aparato
 * en silencio; reintentar cualquier error convierte un rechazo permanente en un
 * bucle contra el servidor cada vez que se cambia de pantalla.
 */

const realFetch = global.fetch;

function stubFetch(porUrl: (url: string) => Response) {
  const urls: string[] = [];
  global.fetch = ((entrada: unknown) => {
    const url = String(entrada);
    urls.push(url);
    return Promise.resolve(porUrl(url));
  }) as typeof fetch;
  return urls;
}

test.afterEach(() => {
  global.fetch = realFetch;
});

// `plataformaNativa()` mira `window`, que no existe aqui: devuelve "web" y
// `guardarTokenNativo` sale antes de pedir nada. Eso ya es una garantia util
// --el navegador no registra aparatos-- y se comprueba primero.
test("fuera del contenedor no se registra ningun aparato", async () => {
  const urls = stubFetch(() => new Response("{}", { status: 200 }));
  const hecho = await guardarTokenNativo("token-cualquiera");
  assert.equal(hecho, true, "no hay nada pendiente que reintentar");
  assert.deepEqual(urls, [], "no debe llamar al servidor desde un navegador");
});

test("un 401 al guardar la suscripcion web queda PENDIENTE", async () => {
  stubFetch((url) =>
    url.includes("vapid-public-key")
      ? new Response(JSON.stringify({ vapidPublicKey: "clave-de-prueba" }), { status: 200 })
      : new Response(JSON.stringify({ error: "Sesion requerida" }), { status: 401 })
  );

  const registro = {
    pushManager: {
      getSubscription: async () => ({
        toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } })
      })
    }
  } as unknown as ServiceWorkerRegistration;

  const hecho = await saveSubscription(registro);
  assert.equal(hecho, false, "sin sesion hay que reintentarlo, no darlo por bueno");
});

test("un 201 deja de estar pendiente", async () => {
  stubFetch((url) =>
    url.includes("vapid-public-key")
      ? new Response(JSON.stringify({ vapidPublicKey: "clave-de-prueba" }), { status: 200 })
      : new Response("{}", { status: 201 })
  );

  const registro = {
    pushManager: {
      getSubscription: async () => ({
        toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } })
      })
    }
  } as unknown as ServiceWorkerRegistration;

  assert.equal(await saveSubscription(registro), true);
});

test("un rechazo que NO es de sesion no se reintenta", async () => {
  // Un 400 o un 500 no se arreglan por volver a mandarlo al cambiar de
  // pantalla: reintentarlo seria golpear al servidor en cada navegacion.
  stubFetch((url) =>
    url.includes("vapid-public-key")
      ? new Response(JSON.stringify({ vapidPublicKey: "clave-de-prueba" }), { status: 200 })
      : new Response(JSON.stringify({ error: "endpoint invalido" }), { status: 400 })
  );

  const registro = {
    pushManager: {
      getSubscription: async () => ({
        toJSON: () => ({ endpoint: "no-es-una-url", keys: { p256dh: "p", auth: "a" } })
      })
    }
  } as unknown as ServiceWorkerRegistration;

  assert.equal(await saveSubscription(registro), true, "no se insiste con un rechazo permanente");
});

test("sin VAPID configurado no queda nada pendiente", async () => {
  // El servidor no tiene claves: no es un problema de sesion y volver a
  // intentarlo no lo arregla.
  stubFetch(() => new Response(JSON.stringify({}), { status: 200 }));
  const registro = { pushManager: { getSubscription: async () => null } } as unknown as ServiceWorkerRegistration;
  assert.equal(await saveSubscription(registro), true);
});

/*
 * ⚠️ `localStorage` LANZA en algunas configuraciones, no devuelve null: el
 * WebView con almacenamiento restringido, las cookies de terceros cortadas, una
 * ventana privada. La lectura estaba sin proteger dentro del efecto, asi que un
 * fallo ahi se llevaba por delante EL AVISO ENTERO -- el unico sitio desde donde
 * se puede conceder el permiso. Y sin dejar rastro.
 *
 * En Node no existe `localStorage`, asi que el acceso lanza de verdad: el
 * entorno de la prueba ES el caso hostil, sin necesidad de simularlo.
 */

test("un localStorage que lanza no descarta el aviso", () => {
  assert.equal(typeof globalThis.localStorage, "undefined", "la prueba depende de que no exista");
  assert.equal(avisoDescartado(), false, "ante la duda se ENSENA: un aviso de mas se cierra");
});

test("guardar el descarte con un localStorage que lanza no rompe nada", () => {
  assert.doesNotThrow(() => recordarDescarte());
});

test("un descarte guardado si se respeta", () => {
  const guardado = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => guardado.get(k) ?? null,
    setItem: (k: string, v: string) => void guardado.set(k, v)
  };
  try {
    assert.equal(avisoDescartado(), false);
    recordarDescarte();
    assert.equal(avisoDescartado(), true);
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
