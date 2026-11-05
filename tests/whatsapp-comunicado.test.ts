import assert from "node:assert/strict";
import test from "node:test";

import { enviarComunicadoAWhatsApp } from "@/lib/whatsapp";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **El envío al grupo falla en silencio por diseño**: nunca lanza, para no
 * romper la publicación del comunicado. Por eso un rechazo de Evolution pasaba
 * sin que nadie lo notara. El 5 de noviembre de 2026 la encuesta iba con una
 * sola opción y Evolution la devolvía con 400 («values does not meet minimum
 * length of 2»), y ni el código ni el log lo decían.
 */

const ENTORNO = {
  WHATSAPP_EVOLUTION_URL: "https://evolution.prueba/",
  WHATSAPP_EVOLUTION_INSTANCE: "tienda",
  WHATSAPP_EVOLUTION_API_KEY: "llave-de-prueba",
  WHATSAPP_ANNOUNCE_GROUP_JID: "123@g.us",
  WHATSAPP_ANNOUNCE_STORE_IDS: "tienda-a"
};

type Llamada = { url: string; cuerpo: Record<string, unknown> };

async function conEvolutionFalso(
  responder: (url: string) => Response | Promise<Response>,
  prueba: (llamadas: Llamada[], errores: string[]) => Promise<void>
) {
  const fetchOriginal = globalThis.fetch;
  const errorOriginal = console.error;
  const llamadas: Llamada[] = [];
  const errores: string[] = [];
  Object.assign(process.env, ENTORNO);
  console.error = (...args: unknown[]) => void errores.push(args.join(" "));
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    llamadas.push({ url, cuerpo: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return responder(url);
  }) as typeof fetch;
  try {
    await prueba(llamadas, errores);
  } finally {
    globalThis.fetch = fetchOriginal;
    console.error = errorOriginal;
    for (const nombre of Object.keys(ENTORNO)) delete process.env[nombre];
  }
}

test("manda el texto y luego una encuesta con las dos opciones que exige Evolution", async () => {
  await conEvolutionFalso(
    () => new Response("{}", { status: 201 }),
    async (llamadas, errores) => {
      await enviarComunicadoAWhatsApp({ storeId: "tienda-a", title: "Promo", body: "30% OFF" });

      assert.deepEqual(llamadas.map((l) => l.url), [
        "https://evolution.prueba/message/sendText/tienda",
        "https://evolution.prueba/message/sendPoll/tienda"
      ]);
      const encuesta = llamadas[1].cuerpo;
      assert.equal(encuesta.number, "123@g.us");
      assert.ok((encuesta.values as string[]).length >= 2);
      assert.deepEqual(errores, []);
    }
  );
});

test("con imagen manda el medio, no el texto", async () => {
  await conEvolutionFalso(
    () => new Response("{}", { status: 201 }),
    async (llamadas) => {
      await enviarComunicadoAWhatsApp({ storeId: "tienda-a", title: "Promo", body: "30% OFF", imageUrl: "https://r2.prueba/a.jpg" });

      assert.equal(llamadas[0].url, "https://evolution.prueba/message/sendMedia/tienda");
      assert.equal(llamadas[0].cuerpo.media, "https://r2.prueba/a.jpg");
    }
  );
});

test("un rechazo de Evolution deja status y cuerpo en el log, sin lanzar y sin la llave", async () => {
  await conEvolutionFalso(
    () => new Response('{"message":["rechazado"]}', { status: 400 }),
    async (_llamadas, errores) => {
      await enviarComunicadoAWhatsApp({ storeId: "tienda-a", title: "Promo", body: "30% OFF" });

      assert.equal(errores.length, 2);
      assert.match(errores[0], /400 en \/message\/sendText\/tienda.*rechazado/);
      assert.ok(!errores.join(" ").includes(ENTORNO.WHATSAPP_EVOLUTION_API_KEY));
    }
  );
});

test("un fallo de red también deja rastro y no lanza", async () => {
  await conEvolutionFalso(
    () => {
      throw new Error("sin conexión");
    },
    async (_llamadas, errores) => {
      await enviarComunicadoAWhatsApp({ storeId: "tienda-a", title: "Promo", body: "30% OFF" });

      assert.match(errores[0], /no se pudo enviar el comunicado: sin conexión/);
    }
  );
});

test("una tienda fuera de la lista no manda nada", async () => {
  await conEvolutionFalso(
    () => new Response("{}", { status: 201 }),
    async (llamadas) => {
      await enviarComunicadoAWhatsApp({ storeId: "tienda-b", title: "Promo", body: "30% OFF" });

      assert.equal(llamadas.length, 0);
    }
  );
});
