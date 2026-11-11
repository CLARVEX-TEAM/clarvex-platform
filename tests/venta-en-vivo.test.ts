import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { textoVentaEnVivo } from "../lib/venta-en-vivo-texto";
import { construirMensaje } from "../lib/push-fcm";
import { CANAL_AVISOS_ID, CANAL_VENTA_ID } from "../lib/push-canal";

test("asesor: su venta, su % y lo que le falta", () => {
  assert.deepEqual(textoVentaEnVivo({ propia: { venta: 3450, meta: 5000 }, tienda: null, hora: "4:32 p.m." }), {
    title: "Hoy llevas $3,450.00 · 69 %",
    body: "Te faltan $1,550.00 para la meta · 4:32 p.m."
  });
});

test("asesor que ya llegó: lo celebra en vez de decir que le falta", () => {
  const t = textoVentaEnVivo({ propia: { venta: 5300, meta: 5000 }, tienda: null, hora: "6:00 p.m." });
  assert.equal(t?.title, "Hoy llevas $5,300.00 · 106 %");
  assert.match(t!.body, /¡Tu meta lograda! 🎉/);
});

test("gerencia: la tienda en el título y lo suyo en el cuerpo", () => {
  const t = textoVentaEnVivo({ propia: { venta: 2000, meta: 4000 }, tienda: { venta: 9816, meta: 20600 }, hora: "11:40 a.m." });
  assert.equal(t?.title, "Tienda hoy: $9,816.00 · 48 %");
  assert.equal(t?.body, "Tú: $2,000.00 · 50 % · A la tienda le faltan $10,784.00 para la meta · 11:40 a.m.");
});

test("sin meta no inventa porcentajes", () => {
  assert.deepEqual(textoVentaEnVivo({ propia: { venta: 800, meta: 0 }, tienda: null, hora: "1:00 p.m." }), { title: "Hoy llevas $800.00", body: "1:00 p.m." });
  assert.equal(textoVentaEnVivo({ propia: null, tienda: null, hora: "1:00 p.m." }), null);
});

test("FCM: la venta en vivo va al canal silencioso, sin sonido y con su etiqueta para reemplazarse", () => {
  const m = construirMensaje("t", { title: "x", body: "y", tag: "venta-en-vivo", silencioso: true }).message;
  assert.equal(m.android.notification.channelId, CANAL_VENTA_ID);
  assert.equal(m.android.notification.defaultSound, false);
  assert.equal(m.android.notification.tag, "venta-en-vivo");
  const normal = construirMensaje("t", { title: "x", body: "y" }).message;
  assert.equal(normal.android.notification.channelId, CANAL_AVISOS_ID, "los avisos de siempre no cambian");
  assert.equal(normal.android.notification.defaultSound, true);
});

test("lo silencioso SOLO va a aparatos que tienen el canal silencioso", () => {
  const push = readFileSync(path.join(__dirname, "..", "lib", "push.ts"), "utf8");
  assert.match(push, /payload\.silencioso \? \{ canalVentaEnVivo: true \} : \{\}/);
});

test("la venta en vivo NO pasa por WhatsApp", () => {
  const fuente = readFileSync(path.join(__dirname, "..", "lib", "venta-en-vivo.ts"), "utf8");
  assert.equal(/import \{[^}]*\bavisar\b[^}]*\} from "@\/lib\/whatsapp-canal"/.test(fuente), false);
  assert.match(fuente, /dispatchPushToUsers/);
});

test("el service worker no suena ni vibra con una silenciosa", () => {
  const sw = readFileSync(path.join(__dirname, "..", "public", "sw.js"), "utf8");
  assert.match(sw, /silent: Boolean\(data\.silencioso\)/);
  assert.match(sw, /renotify: !data\.silencioso/);
});
