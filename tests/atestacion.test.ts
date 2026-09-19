import assert from "node:assert/strict";
import test from "node:test";
import { bloquea, comoSeDice, esFaltaDeSoporte, procedenciaDe } from "../lib/atestacion";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Lo que hay hoy NO demuestra la procedencia.** La vinculación desde la APK
 * 1.5.1 prueba posesión de una llave presentada por una sesión válida — no de
 * dónde salió el binario. Está anotado desde entonces para no exagerarlo.
 *
 * ⚠️ Y el riesgo de esta función no es que no detecte: es que **deje fuera a
 * equipos legítimos**. Emuladores, Android viejo y algunos fabricantes no pueden
 * atestiguar, y eso es NORMAL. Confundir «no pudo» con «no cuadra» deja a la
 * tienda sin poder trabajar, que es peor que el ataque del que protege.
 */

const noPudo = { ok: false as const, motivo: "el teléfono no entregó cadena de atestación" };
const noCuadra = { ok: false as const, motivo: "la raíz no es la de Google" };
const verificada = { ok: true as const, nivel: "hardware" as const, raizConocida: true };

test("una cadena buena verifica el origen", () => {
  assert.equal(procedenciaDe({ cadena: verificada, aprobadoPorGerencia: false }), "VERIFICADO");
});

test("⚠️ «no pudo» y «no cuadra» son OPUESTOS", () => {
  assert.equal(procedenciaDe({ cadena: noPudo, aprobadoPorGerencia: false }), "SIN_SOPORTE");
  assert.equal(procedenciaDe({ cadena: noCuadra, aprobadoPorGerencia: false }), "RECHAZADO");
});

test("⚠️ gerencia puede aprobar «no pudo», NUNCA «no cuadra»", () => {
  /*
   * Es la línea que no se cruza. Aprobar a mano un equipo cuya cadena no
   * verifica sería firmar exactamente lo que esto viene a detectar — y quien
   * aprueba no tiene forma de saber que está haciendo eso.
   */
  assert.equal(procedenciaDe({ cadena: noPudo, aprobadoPorGerencia: true }), "APROBADO_A_MANO");
  assert.equal(
    procedenciaDe({ cadena: noCuadra, aprobadoPorGerencia: true }),
    "RECHAZADO",
    "la aprobación NO lava una cadena que no cuadra"
  );
});

test("sin intento todavía no se juzga", () => {
  assert.equal(procedenciaDe({ cadena: null, aprobadoPorGerencia: false }), "PENDIENTE");
  assert.equal(procedenciaDe({ cadena: null, aprobadoPorGerencia: true }), "APROBADO_A_MANO");
});

test("los motivos de «no pudo» se reconocen aunque cambie la redacción", () => {
  assert.equal(esFaltaDeSoporte("Android demasiado viejo para atestiguar"), true);
  assert.equal(esFaltaDeSoporte("El teléfono NO ENTREGÓ CADENA"), true, "sin importar mayúsculas");
  assert.equal(esFaltaDeSoporte("la firma del certificado no coincide"), false);
  assert.equal(esFaltaDeSoporte(""), false, "un motivo vacío no es falta de soporte");
});

test("⚠️ en modo OBSERVAR no se bloquea a nadie, ni siquiera al rechazado", () => {
  /*
   * Se publica así a propósito: primero se mira qué reportan los equipos reales
   * de la tienda y solo después se decide. Encenderlo a ciegas deja fuera a
   * quien trabaja, y eso se nota un lunes a las diez de la mañana.
   */
  for (const p of ["VERIFICADO", "SIN_SOPORTE", "RECHAZADO", "APROBADO_A_MANO", "PENDIENTE"] as const) {
    assert.equal(bloquea(p, "observar"), false, `${p} no bloquea en modo observar`);
  }
});

test("en modo EXIGIR pasan solo el verificado y el aprobado a mano", () => {
  assert.equal(bloquea("VERIFICADO", "exigir"), false);
  assert.equal(bloquea("APROBADO_A_MANO", "exigir"), false);
  assert.equal(bloquea("RECHAZADO", "exigir"), true);
  assert.equal(bloquea("SIN_SOPORTE", "exigir"), true);
  assert.equal(bloquea("PENDIENTE", "exigir"), true);
});

test("lo que ve gerencia distingue lo grave de lo normal", () => {
  assert.equal(comoSeDice("VERIFICADO").tono, "bien");
  assert.equal(comoSeDice("SIN_SOPORTE").tono, "aviso", "no poder atestiguar es normal, no una alarma");
  assert.equal(comoSeDice("RECHAZADO").tono, "malo");
  assert.match(comoSeDice("RECHAZADO").texto, /NO cuadra/);
});
