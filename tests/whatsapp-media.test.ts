import assert from "node:assert/strict";
import test from "node:test";

import { enviarMediaPorWhatsApp } from "@/lib/whatsapp-media";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ El 6 de noviembre de 2026 la foto de evidencia se mandaba como data URL.
 * Evolution la rechazaba con 400 y al empleado se le decía que ya estaba con
 * gerencia. Sin este resultado, una foto perdida se ve igual que una entregada.
 */

const ENTORNO = {
  WHATSAPP_EVOLUTION_URL: "https://evolution.prueba/",
  WHATSAPP_EVOLUTION_INSTANCE: "tienda",
  WHATSAPP_EVOLUTION_API_KEY: "llave-de-prueba"
};

async function conFetch(respuesta: Response, cuerpos: string[], fn: () => Promise<void>) {
  const original = globalThis.fetch;
  const previo = { ...process.env };
  Object.assign(process.env, ENTORNO);
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    cuerpos.push(String(init.body));
    return respuesta;
  }) as unknown as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
    process.env = previo;
  }
}

test("manda el base64 sin el prefijo data:", async () => {
  const cuerpos: string[] = [];
  await conFetch(new Response("{}", { status: 201 }), cuerpos, async () => {
    const ok = await enviarMediaPorWhatsApp({ phone: "528100000001", mediaUrl: "data:image/jpeg;base64,QUJD" });
    assert.equal(ok, true);
  });
  assert.equal(JSON.parse(cuerpos[0]).media, "QUJD");
});

test("una URL pública pasa sin tocarla", async () => {
  const cuerpos: string[] = [];
  await conFetch(new Response("{}", { status: 201 }), cuerpos, async () => {
    await enviarMediaPorWhatsApp({ phone: "528100000001", mediaUrl: "https://x.prueba/a.jpg" });
  });
  assert.equal(JSON.parse(cuerpos[0]).media, "https://x.prueba/a.jpg");
});

test("un rechazo de Evolution se reporta como no enviado", async () => {
  const error = console.error;
  console.error = () => {};
  try {
    await conFetch(new Response("{}", { status: 400 }), [], async () => {
      const ok = await enviarMediaPorWhatsApp({ phone: "528100000001", mediaUrl: "QUJD" });
      assert.equal(ok, false);
    });
  } finally {
    console.error = error;
  }
});
