import assert from "node:assert/strict";
import test from "node:test";
import { avisosDelEquipo, diasSinAparecer, megasLibres } from "../lib/salud-equipo";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Medir no es telemetría.** `/diagnostico` enseña trece filas desde la APK
 * 1.5.1, pero solo a quien tiene el teléfono en la mano. Gerencia no puede saber
 * que al equipo de la tienda le quedan 200 MB hasta que algo se rompe — y lo que
 * se rompe entonces es la cámara, las evidencias o la cola, sin que ninguna diga
 * que el problema era el espacio.
 *
 * ⚠️ **Y trece filas en verde no demuestran nada.** Ya pasó con el candado de la
 * huella: el diagnóstico salía perfecto porque se miraba DESPUÉS, cuando todo
 * estaba puesto. Por eso esto no devuelve una lista de comprobaciones sino los
 * PROBLEMAS, y calla el resto.
 */

const AHORA = new Date("2026-09-19T12:00:00Z");
const sano = {
  camera: true,
  notifications: true,
  automaticTime: true,
  webView: "130.0.6723.107",
  freeStorageBytes: 4 * 1024 * 1024 * 1024,
  colaPendiente: 0,
  colaFallida: 0
};
const textos = (avisos: ReturnType<typeof avisosDelEquipo>) => avisos.map((a) => a.texto).join(" | ");

test("un equipo sano no dice nada", () => {
  // Un aviso permanente se deja de leer. El silencio es la señal de que va bien.
  assert.deepEqual(avisosDelEquipo(sano, AHORA, AHORA, AHORA), []);
});

test("⚠️ SIN medida no se dice que todo esta bien", () => {
  /*
   * «Lo miré y está sano» y «nunca me lo ha contado» son cosas distintas.
   * Confundirlas deja un equipo roto pasando por bueno, que es justo lo que esta
   * telemetría viene a evitar.
   */
  const avisos = avisosDelEquipo(null, AHORA, null, AHORA);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0]!.texto, /Todavía no ha reportado/);
});

test("⚠️ la hora a mano rompe las funciones FIRMADAS, y se dice en alto", () => {
  /*
   * La firma del dispositivo lleva una ventana de dos minutos. Con la hora
   * puesta a mano se sale de ella y las peticiones firmadas empiezan a
   * rechazarse — con un error que no habla de la hora.
   */
  const avisos = avisosDelEquipo({ ...sano, automaticTime: false }, AHORA, AHORA, AHORA);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0]!.gravedad, "alta");
  assert.match(avisos[0]!.texto, /hora automática/);
});

test("⚠️ el disco lleno se avisa ANTES de que rompa otra cosa", () => {
  const avisos = avisosDelEquipo({ ...sano, freeStorageBytes: 200 * 1024 * 1024 }, AHORA, AHORA, AHORA);
  assert.equal(avisos[0]?.gravedad, "alta");
  assert.match(avisos[0]!.texto, /200 MB/);
});

test("las capturas perdidas van PRIMERO y las pendientes despues", () => {
  const avisos = avisosDelEquipo(
    { ...sano, colaFallida: 2, colaPendiente: 5 },
    AHORA, AHORA, AHORA
  );
  assert.equal(avisos[0]?.gravedad, "alta");
  assert.match(avisos[0]!.texto, /no se pudieron guardar/);
  assert.match(textos(avisos), /5 captura\(s\) esperando conexión/);
});

test("un equipo desaparecido se nota aunque su ultima medida fuera buena", () => {
  const haceCinco = new Date("2026-09-14T12:00:00Z");
  const avisos = avisosDelEquipo(sano, haceCinco, haceCinco, AHORA);
  assert.equal(avisos[0]?.gravedad, "alta");
  assert.match(avisos[0]!.texto, /5 días sin conectarse/);
  // Y se dice que el estado que se enseña es viejo, para no juzgarlo por bueno.
  assert.match(textos(avisos), /de hace 5 días/);
});

test("las notificaciones apagadas explican POR QUE importa", () => {
  const avisos = avisosDelEquipo({ ...sano, notifications: false }, AHORA, AHORA, AHORA);
  assert.match(avisos[0]!.texto, /no le llegan avisos/);
});

test("un WebView viejo se avisa, pero no es urgente", () => {
  const avisos = avisosDelEquipo({ ...sano, webView: "98.0.4758.101" }, AHORA, AHORA, AHORA);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0]!.gravedad, "media");
  assert.match(avisos[0]!.texto, /WebView es la 98/);
});

test("un WebView que no se entiende NO inventa un problema", () => {
  // Un valor raro no es una versión vieja. Avisar de lo que no se sabe manda a
  // gerencia a buscar donde no hay nada.
  assert.deepEqual(avisosDelEquipo({ ...sano, webView: "desconocido" }, AHORA, AHORA, AHORA), []);
  assert.deepEqual(avisosDelEquipo({ ...sano, webView: undefined }, AHORA, AHORA, AHORA), []);
});

test("lo que no se midio no se juzga", () => {
  // Campos ausentes ≠ campos en falso. Un `undefined` no es una cámara rota.
  assert.deepEqual(avisosDelEquipo({}, AHORA, AHORA, AHORA), []);
});

test("las cuentas auxiliares no rompen con basura", () => {
  assert.equal(megasLibres(undefined), null);
  assert.equal(megasLibres(-5), null);
  assert.equal(megasLibres(1024 * 1024 * 300), 300);
  assert.equal(diasSinAparecer(null), null);
  assert.equal(diasSinAparecer(new Date("2026-09-20T12:00:00Z"), AHORA), 0, "un reloj adelantado no da días negativos");
});
