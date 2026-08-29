import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  interpretarEntrante,
  parsearAutores,
  parsearCanales,
  seRefleja,
  tiendaDelCanal,
  verificarFirmaSlack
} from "../lib/slack-chat";

/* ─── el mapa de canales ──────────────────────────────────────────────────── */

test("lee el mapa de tiendas y canales", () => {
  const c = parsearCanales("clarvex-demo-store=C09ABC, otra=C09DEF");
  assert.equal(c.get("clarvex-demo-store"), "C09ABC");
  assert.equal(c.get("otra"), "C09DEF");
  assert.equal(c.size, 2);
});

test("una variable vacia o rota no revienta ni inventa nada", () => {
  assert.equal(parsearCanales(undefined).size, 0);
  assert.equal(parsearCanales("").size, 0);
  assert.equal(parsearCanales("basura,sin=,=igual").size, 0);
});

test("del canal se saca la tienda", () => {
  const c = parsearCanales("uno=C1,dos=C2");
  assert.equal(tiendaDelCanal(c, "C2"), "dos");
  assert.equal(tiendaDelCanal(c, "C9"), null);
});

/* ─── qué se refleja ──────────────────────────────────────────────────────── */

test("una sala de GRUPO se refleja en el canal de su tienda", () => {
  const c = parsearCanales("uno=C1");
  assert.equal(seRefleja({ tipo: "GROUP", storeId: "uno" }, c), "C1");
});

test("⚠️ un chat DIRECTO nunca se refleja", () => {
  // Es privado entre dos personas: volcarlo a un canal lo publicaria sin que
  // ninguna de las dos lo haya elegido.
  const c = parsearCanales("uno=C1");
  assert.equal(seRefleja({ tipo: "DIRECT", storeId: "uno" }, c), null);
});

test("una tienda sin canal no se refleja", () => {
  assert.equal(seRefleja({ tipo: "GROUP", storeId: "otra" }, parsearCanales("uno=C1")), null);
});

/* ─── el eco, que es el fallo clasico de un espejo ────────────────────────── */

const evento = (e: Record<string, unknown>) => ({ type: "event_callback", event: { type: "message", ...e } });

test("un mensaje normal de Slack entra", () => {
  const r = interpretarEntrante(evento({ user: "U1", text: "  hola  ", channel: "C1", ts: "1.2" }));
  assert.equal(r.accion, "mensaje");
  assert.ok(r.accion === "mensaje" && r.texto === "hola");
});

test("⚠️ lo que publicamos nosotros se ignora: si no, rebota para siempre", () => {
  const porBot = interpretarEntrante(evento({ bot_id: "B1", text: "eco", channel: "C1", ts: "1.2" }));
  assert.equal(porBot.accion, "ignorar");
  const porApp = interpretarEntrante(evento({ app_id: "A1", user: "U1", text: "eco", channel: "C1", ts: "1.2" }));
  assert.equal(porApp.accion, "ignorar");
});

test("ediciones, borrados y entradas al canal se ignoran", () => {
  for (const subtype of ["message_changed", "message_deleted", "channel_join", "file_share"]) {
    const r = interpretarEntrante(evento({ subtype, user: "U1", text: "x", channel: "C1", ts: "1.2" }));
    assert.equal(r.accion, "ignorar", `${subtype} no se ignoro`);
  }
});

test("una respuesta dentro de un hilo se ignora", () => {
  // El espejo no tiene hilos; meterla suelta la sacaria de contexto.
  const r = interpretarEntrante(evento({ user: "U1", text: "x", channel: "C1", ts: "2.0", thread_ts: "1.0" }));
  assert.equal(r.accion, "ignorar");
});

test("sin texto, sin canal o sin remitente se ignora", () => {
  assert.equal(interpretarEntrante(evento({ user: "U1", text: "   ", channel: "C1", ts: "1" })).accion, "ignorar");
  assert.equal(interpretarEntrante(evento({ text: "x", channel: "C1", ts: "1" })).accion, "ignorar");
  assert.equal(interpretarEntrante(evento({ user: "U1", text: "x", ts: "1" })).accion, "ignorar");
});

test("un mensaje larguisimo se corta, no se rechaza", () => {
  const r = interpretarEntrante(evento({ user: "U1", text: "a".repeat(5000), channel: "C1", ts: "1" }));
  assert.ok(r.accion === "mensaje" && r.texto.length === 1000);
});

test("el reto de verificacion se devuelve tal cual", () => {
  const r = interpretarEntrante({ type: "url_verification", challenge: "abc123" });
  assert.deepEqual(r, { accion: "reto", challenge: "abc123" });
});

/* ─── los autores ─────────────────────────────────────────────────────────── */

test("lee el mapa de autores", () => {
  const a = parsearAutores("U08ABC=102259, U08DEF=81893");
  assert.equal(a.get("U08ABC"), "102259");
  assert.equal(a.get("U08DEF"), "81893");
});

test("⚠️ un remitente sin mapear no tiene autor por omision", () => {
  // Un mensaje firmado por quien no lo escribio es peor que uno perdido.
  assert.equal(parsearAutores("U1=100").get("U9"), undefined);
});

/* ─── la firma ────────────────────────────────────────────────────────────── */

const SECRETO = "un-secreto-de-prueba";
const firmar = (cuerpo: string, ts: string, secret = SECRETO) =>
  `v0=${crypto.createHmac("sha256", secret).update(`v0:${ts}:${cuerpo}`).digest("hex")}`;

test("una firma buena pasa", () => {
  const ahora = 1_700_000_000_000;
  const ts = String(Math.floor(ahora / 1000));
  const cuerpo = '{"type":"event_callback"}';
  const r = verificarFirmaSlack(cuerpo, firmar(cuerpo, ts), ts, { secret: SECRETO, ahora });
  assert.deepEqual(r, { ok: true });
});

test("distingue el error NUESTRO del ataque", () => {
  // Es la leccion de Mercado Pago: con un booleano las dos escriben la misma
  // linea de log, y esa linea hace pensar en un atacante y no en un .env roto.
  const ahora = 1_700_000_000_000;
  const ts = String(Math.floor(ahora / 1000));
  assert.deepEqual(verificarFirmaSlack("{}", "v0=x", ts, { secret: undefined, ahora }), {
    ok: false,
    motivo: "sin-secreto"
  });
  assert.deepEqual(verificarFirmaSlack("{}", null, ts, { secret: SECRETO, ahora }), { ok: false, motivo: "sin-firma" });
});

test("un cuerpo cambiado no cuadra", () => {
  const ahora = 1_700_000_000_000;
  const ts = String(Math.floor(ahora / 1000));
  const firma = firmar('{"a":1}', ts);
  const r = verificarFirmaSlack('{"a":2}', firma, ts, { secret: SECRETO, ahora });
  assert.deepEqual(r, { ok: false, motivo: "no-coincide" });
});

test("otro secreto no cuadra", () => {
  const ahora = 1_700_000_000_000;
  const ts = String(Math.floor(ahora / 1000));
  const r = verificarFirmaSlack("{}", firmar("{}", ts, "otro"), ts, { secret: SECRETO, ahora });
  assert.deepEqual(r, { ok: false, motivo: "no-coincide" });
});

test("⚠️ una peticion vieja se rechaza aunque la firma sea correcta", () => {
  // Sin esto, quien capture una peticion valida puede reenviarla mañana.
  const ahora = 1_700_000_000_000;
  const viejo = String(Math.floor(ahora / 1000) - 600);
  const r = verificarFirmaSlack("{}", firmar("{}", viejo), viejo, { secret: SECRETO, ahora });
  assert.deepEqual(r, { ok: false, motivo: "caducada" });
});

test("una firma de otro largo no revienta", () => {
  // `timingSafeEqual` LANZA si los buffers miden distinto, en vez de devolver
  // false. Sin el try, una firma corta tumbaria el endpoint con un 500.
  const ahora = 1_700_000_000_000;
  const ts = String(Math.floor(ahora / 1000));
  assert.deepEqual(verificarFirmaSlack("{}", "v0=corta", ts, { secret: SECRETO, ahora }), {
    ok: false,
    motivo: "no-coincide"
  });
});
