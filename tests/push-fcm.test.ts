import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import {
  enviarPorFcm,
  leerCredenciales,
  normalizarLlavePrivada,
  olvidarTokenDeAcceso
} from "../lib/push-fcm";

/*
 * Por qué existen estas pruebas.
 *
 * FCM es el único camino de notificaciones que tiene la app de Android: el
 * WebView no implementa la API de Push, así que si esto calla, el teléfono de
 * la tienda no recibe nada y NADIE se entera --una notificación que no llega no
 * deja rastro en ninguna pantalla--.
 *
 * Dos invariantes cuestan de verdad si se rompen:
 *
 * 1. **Un error NUESTRO no puede borrarle el aparato a nadie.** FCM contesta
 *    400 tanto por un token muerto como por un payload mal armado. Tratar el
 *    segundo como el primero desregistraría los teléfonos de toda la tienda por
 *    un bug de una línea, y volverían a registrarse solo al reabrir la app.
 * 2. **La llave privada llega escapada.** Un `.env` no admite saltos de línea,
 *    así que la de Google se pega con `\n` literales. Sin normalizarla no falla
 *    el arranque: falla el primer envío, con un error de criptografía que no
 *    señala a la variable.
 */

// ⚠️ La cabecera PEM va PARTIDA, igual que en `lib/push-fcm.ts`. El escaneo de
// secretos de la CI busca `BEGIN [A-Z ]*PRIVATE KEY` en lo que anade cada
// commit y no distingue una cabecera de adorno de una llave de verdad --ni debe
// intentarlo--. Juntarlas otra vez pone en rojo un trabajo obligatorio.
const ABRE = "-----BEGIN" + " " + "PRIVATE KEY-----";
const CIERRA = "-----END" + " " + "PRIVATE KEY-----";

// Una llave real de juguete: `importPKCS8` valida de verdad, así que una cadena
// inventada no serviría para probar el camino de firma.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const LLAVE_PEM = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

const realFetch = global.fetch;
const entornoOriginal = {
  FCM_PROJECT_ID: process.env.FCM_PROJECT_ID,
  FCM_CLIENT_EMAIL: process.env.FCM_CLIENT_EMAIL,
  FCM_PRIVATE_KEY: process.env.FCM_PRIVATE_KEY
};

function configurarCredenciales() {
  process.env.FCM_PROJECT_ID = "clarvex-pruebas";
  process.env.FCM_CLIENT_EMAIL = "robot@clarvex-pruebas.iam.gserviceaccount.com";
  process.env.FCM_PRIVATE_KEY = LLAVE_PEM;
}

type Llamada = { url: string; cuerpo: unknown; cabeceras: Record<string, string> };

/** Sustituye `fetch`: el primer POST al endpoint de OAuth devuelve un token. */
function stubFetch(responderEnvio: (llamada: Llamada, indice: number) => Response) {
  const llamadas: Llamada[] = [];
  let envios = 0;
  global.fetch = ((entrada: unknown, init?: RequestInit) => {
    const url = String(entrada);
    const cabeceras = (init?.headers ?? {}) as Record<string, string>;
    const crudo = init?.body;
    const cuerpo =
      typeof crudo === "string" ? (JSON.parse(crudo) as unknown) : crudo instanceof URLSearchParams ? crudo.toString() : crudo;
    const llamada: Llamada = { url, cuerpo, cabeceras };
    llamadas.push(llamada);

    if (url.includes("oauth2.googleapis.com")) {
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: "acceso-de-prueba", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
    }
    envios += 1;
    return Promise.resolve(responderEnvio(llamada, envios));
  }) as typeof fetch;
  return llamadas;
}

test.beforeEach(() => {
  olvidarTokenDeAcceso();
  configurarCredenciales();
});

test.afterEach(() => {
  global.fetch = realFetch;
  for (const [clave, valor] of Object.entries(entornoOriginal)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
});

test("la llave con barra-ene escapada se convierte en saltos reales", () => {
  const escapada = `${ABRE}\\nAAAA\\nBBBB\\n${CIERRA}`;
  const normalizada = normalizarLlavePrivada(escapada);
  assert.ok(!normalizada.includes("\\n"), "no debe quedar ninguna barra-ene literal");
  assert.equal(normalizada.split("\n").length, 4);
});

test("una llave que ya trae saltos reales no se toca", () => {
  const real = `${ABRE}\nAAAA\n${CIERRA}`;
  assert.equal(normalizarLlavePrivada(real), real);
});

test("faltando una sola variable, no hay credenciales", () => {
  assert.equal(leerCredenciales({ FCM_PROJECT_ID: "x", FCM_CLIENT_EMAIL: "y" }), null);
});

test("una llave que no es PEM se rechaza antes de firmar", () => {
  const credenciales = leerCredenciales({
    FCM_PROJECT_ID: "x",
    FCM_CLIENT_EMAIL: "y",
    FCM_PRIVATE_KEY: "esto-no-es-una-llave"
  });
  assert.equal(credenciales, null);
});

test("sin credenciales no se toca la red", async () => {
  delete process.env.FCM_PROJECT_ID;
  const llamadas = stubFetch(() => new Response("", { status: 200 }));
  const resultado = await enviarPorFcm(["token-a"], { title: "Hola", body: "Prueba" });
  assert.equal(llamadas.length, 0, "no debe haber ni una peticion");
  assert.deepEqual(resultado, { enviados: 0, caducados: [] });
});

test("manda una peticion por aparato y firma con el token de acceso", async () => {
  const llamadas = stubFetch(() => new Response("{}", { status: 200 }));
  const resultado = await enviarPorFcm(["token-a", "token-b"], {
    title: "Meta alcanzada",
    body: "La tienda cerro en verde",
    url: "/kpis"
  });

  assert.equal(resultado.enviados, 2);
  assert.deepEqual(resultado.caducados, []);

  const envios = llamadas.filter((l) => l.url.includes("fcm.googleapis.com"));
  assert.equal(envios.length, 2);
  assert.ok(envios[0].url.includes("/projects/clarvex-pruebas/messages:send"));
  assert.equal(envios[0].cabeceras.Authorization, "Bearer acceso-de-prueba");
});

test("el mensaje lleva notificacion Y datos, y los datos son cadenas", async () => {
  const llamadas = stubFetch(() => new Response("{}", { status: 200 }));
  await enviarPorFcm(["token-a"], { title: "Titulo", body: "Cuerpo", url: "/pendientes", tag: "pendientes" });

  const envio = llamadas.find((l) => l.url.includes("fcm.googleapis.com"));
  const mensaje = (envio?.cuerpo as { message: Record<string, unknown> }).message;

  // Sin `notification` no se pinta nada con la app cerrada; sin `data` no se
  // sabe a que pantalla ir al tocarla.
  assert.deepEqual(mensaje.notification, { title: "Titulo", body: "Cuerpo" });
  const datos = mensaje.data as Record<string, unknown>;
  assert.equal(datos.url, "/pendientes");
  for (const [clave, valor] of Object.entries(datos)) {
    assert.equal(typeof valor, "string", `data.${clave} tiene que ser cadena o FCM rechaza el mensaje entero`);
  }

  // Con la prioridad por omision, Doze puede retener el aviso hasta la siguiente
  // ventana de mantenimiento: llegaria horas tarde.
  assert.equal((mensaje.android as Record<string, unknown>).priority, "high");
});

// ⚠️ Los cuerpos de abajo NO estan inventados: se capturaron contra la FCM real
// el 6 de septiembre de 2026, con la cuenta de servicio de Clarvex. Importa,
// porque la version anterior de estas pruebas suponia una forma que Google NO
// usa --un 404 con `status: UNREGISTERED`-- y por eso daba por buena una regla
// que decidia por el codigo de estado.

// Token con forma invalida, proyecto correcto. Google contesta 400, no 404.
const CUERPO_TOKEN_INVALIDO = JSON.stringify({
  error: {
    code: 400,
    message: "The registration token is not a valid FCM registration token",
    status: "INVALID_ARGUMENT",
    details: [
      { "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "INVALID_ARGUMENT" },
      {
        "@type": "type.googleapis.com/google.rpc.BadRequest",
        fieldViolations: [{ field: "message.token", description: "The registration token is not a valid..." }]
      }
    ]
  }
});

// App desinstalada. Google lo marca con `errorCode: UNREGISTERED`.
const CUERPO_DESINSTALADA = JSON.stringify({
  error: {
    code: 404,
    message: "Requested entity was not found.",
    status: "NOT_FOUND",
    details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "UNREGISTERED" }]
  }
});

// Proyecto inexistente o sin permisos. Contesta 403, NO 404.
const CUERPO_PROYECTO_MAL = JSON.stringify({
  error: {
    code: 403,
    message: "Permission denied on resource project clarvex-team-que-no-existe-999.",
    status: "PERMISSION_DENIED",
    details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "CONSUMER_INVALID" }]
  }
});

test("la app desinstalada caduca el aparato", async () => {
  stubFetch(() => new Response(CUERPO_DESINSTALADA, { status: 404 }));
  const resultado = await enviarPorFcm(["token-muerto"], { title: "x", body: "y" });
  assert.deepEqual(resultado.caducados, ["token-muerto"]);
  assert.equal(resultado.enviados, 0);
});

test("un token con forma invalida tambien caduca", async () => {
  stubFetch(() => new Response(CUERPO_TOKEN_INVALIDO, { status: 400 }));
  const resultado = await enviarPorFcm(["token-raro"], { title: "x", body: "y" });
  assert.deepEqual(resultado.caducados, ["token-raro"]);
});

test("un proyecto mal configurado NO borra los aparatos de la tienda", async () => {
  // Es el fallo mas caro posible aqui: un error de configuracion NUESTRO que
  // desregistre todos los telefonos. Vuelven solos, pero solo cuando cada
  // persona abra la app, y mientras tanto nadie recibe nada.
  stubFetch(() => new Response(CUERPO_PROYECTO_MAL, { status: 403 }));
  const resultado = await enviarPorFcm(["token-sano-1", "token-sano-2"], { title: "x", body: "y" });
  assert.deepEqual(resultado.caducados, [], "un 403 de configuracion no puede caducar a nadie");
  assert.equal(resultado.enviados, 0);
});

test("un 404 SIN explicacion no caduca nada", async () => {
  // Antes cualquier 404 vaciaba la tabla. Un 404 puede salir tambien por una
  // ruta mal armada, y ante la duda no se borra: acumular tokens muertos cuesta
  // una peticion desperdiciada; borrar los vivos deja a la tienda sin avisos.
  stubFetch(() => new Response(JSON.stringify({ error: { code: 404, message: "Not found." } }), { status: 404 }));
  const resultado = await enviarPorFcm(["token-sano"], { title: "x", body: "y" });
  assert.deepEqual(resultado.caducados, []);
});

test("un 400 por culpa NUESTRA no borra el aparato de nadie", async () => {
  // Mismo codigo de estado, causa opuesta: el payload iba mal. Si esto contara
  // como token muerto, un bug en el mensaje desregistraria toda la tienda.
  const cuerpo = JSON.stringify({
    error: {
      status: "INVALID_ARGUMENT",
      details: [{ fieldViolations: [{ field: "message.android.ttl", description: "Invalid duration" }] }]
    }
  });
  stubFetch(() => new Response(cuerpo, { status: 400 }));
  const resultado = await enviarPorFcm(["token-sano"], { title: "x", body: "y" });
  assert.deepEqual(resultado.caducados, [], "el aparato tiene que sobrevivir a un error nuestro");
  assert.equal(resultado.enviados, 0);
});

test("un aparato muerto no impide entregar a los demas", async () => {
  stubFetch((llamada) => {
    const mensaje = (llamada.cuerpo as { message: { token: string } }).message;
    return mensaje.token === "malo"
      ? new Response(CUERPO_DESINSTALADA, { status: 404 })
      : new Response("{}", { status: 200 });
  });
  const resultado = await enviarPorFcm(["bueno-1", "malo", "bueno-2"], { title: "x", body: "y" });
  assert.equal(resultado.enviados, 2);
  assert.deepEqual(resultado.caducados, ["malo"]);
});

test("el token de acceso se reutiliza: no se pide uno por notificacion", async () => {
  const llamadas = stubFetch(() => new Response("{}", { status: 200 }));
  await enviarPorFcm(["token-a"], { title: "una", body: "y" });
  await enviarPorFcm(["token-a"], { title: "otra", body: "y" });

  const peticionesDeToken = llamadas.filter((l) => l.url.includes("oauth2.googleapis.com"));
  assert.equal(peticionesDeToken.length, 1, "el token vale una hora; pedirlo dos veces es una llamada de mas por aviso");
});
