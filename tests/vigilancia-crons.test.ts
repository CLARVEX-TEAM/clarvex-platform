import assert from "node:assert/strict";
import test from "node:test";
import { avisoDeProblemas, cadenciaEnHoras, revisarRegistro, revisarRegistros, sinRastro } from "../lib/vigilancia-crons";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Las líneas de abajo son REALES**, copiadas de los registros del servidor
 * el 18 de septiembre de 2026. No son ejemplos inventados: son los tres crons
 * que llevaban semanas fallando sin que nadie se enterara, y la prueba de que
 * el vigilante los habría cazado el primer día.
 *
 * El caso que más importa es el del recordatorio de turno: corría cada quince
 * minutos y fallaba SIEMPRE, así que su archivo estaba recién tocado. Por
 * antigüedad salía sano. Solo mirando lo que ESCRIBIÓ se ve el fallo.
 */

const FALLO_WRAPPER = "endpoint no permitido";
const FALLO_ENV =
  "[2026-09-18T01:00:01+00:00] [plan-reminder] ERROR: CRON_SECRET vacio o ilegible en /root/clarvex-app/.env; no se llama a https://app.adrianluna.mx/api/cron/plan-reminder";
const EXITO_TURNO = '{"ok":true,"date":"2026-09-18","checked":0,"sent":0}';
const EXITO_ASISTENCIA = '{"ok":true,"date":"2026-09-17","stage":"1030","stores":1,"confirmed":0,"sent":2}';
const EXITO_GUION = '[2026-09-18T19:00:01-06:00] [plan-reminder] OK — {"avisados":3}';

const sano = { nombre: "x", ultimaLinea: EXITO_TURNO, horasSinEscribir: 0.2, maxHoras: 1, horasDesdeElCrontab: 900 };

test("caza el cron que corre cada 15 min y falla SIEMPRE", () => {
  // El recordatorio de turno de la APK 1.6: archivo recién tocado, cero avisos
  // entregados en su vida. Por antigüedad habría pasado por sano.
  const problema = revisarRegistro({
    nombre: "shift-reminder",
    ultimaLinea: FALLO_WRAPPER,
    horasSinEscribir: 0.1,
    maxHoras: 1,
    horasDesdeElCrontab: 900
  });
  assert.ok(problema, "tenía que avisar");
  assert.equal(problema.motivo, "el wrapper rechazó el endpoint");
});

test("caza los dos que apuntaban al servidor viejo", () => {
  const problema = revisarRegistro({
    nombre: "plan-reminder",
    ultimaLinea: FALLO_ENV,
    horasSinEscribir: 5,
    maxHoras: 26,
    horasDesdeElCrontab: 900
  });
  assert.ok(problema);
  assert.equal(problema.motivo, "el guion reportó un error");
  assert.match(problema.detalle, /CRON_SECRET/);
});

test("una corrida buena no se avisa, venga como venga", () => {
  for (const linea of [EXITO_TURNO, EXITO_ASISTENCIA, EXITO_GUION]) {
    assert.equal(revisarRegistro({ ...sano, ultimaLinea: linea }), null, linea.slice(0, 40));
  }
});

test("varias salidas pegadas en una linea siguen siendo exito", () => {
  // curl no termina en salto de línea: el log del cron de 15 minutos acumula
  // varias respuestas en el mismo renglón. Es la forma REAL de ese archivo.
  const pegadas = `${EXITO_TURNO}${EXITO_TURNO}${EXITO_TURNO}`;
  assert.equal(revisarRegistro({ ...sano, ultimaLinea: pegadas }), null);
});

test("un exito que MENCIONA error no dispara aviso falso", () => {
  /*
   * ⚠️ Esta es la razón de que las marcas sean una lista explícita y no un
   * «contiene la palabra error». Un vigilante que grita sin motivo se acaba
   * ignorando igual que un log que nadie abre, y entonces no arreglamos nada.
   */
  assert.equal(revisarRegistro({ ...sano, ultimaLinea: '{"ok":true,"error":null,"sent":2}' }), null);
});

test("avisa del que lleva demasiado sin correr", () => {
  const problema = revisarRegistro({
    nombre: "backup-db",
    ultimaLinea: EXITO_GUION,
    horasSinEscribir: 50,
    maxHoras: 26,
    horasDesdeElCrontab: 900
  });
  assert.ok(problema);
  assert.equal(problema.motivo, "lleva demasiado sin correr");
  assert.match(problema.detalle, /2 días/);
});

test("avisa del que nunca ha dejado salida", () => {
  const problema = revisarRegistro({
    nombre: "energy-checklist-reminder",
    ultimaLinea: null,
    horasSinEscribir: null,
    maxHoras: 72,
    horasDesdeElCrontab: 900
  });
  assert.ok(problema);
  assert.equal(problema.motivo, "nunca ha dejado salida");
});

test("un retraso DENTRO del margen no molesta a nadie", () => {
  // Un despliegue o un reinicio corren la hora de un diario. Avisar por eso
  // entrena a ignorar el aviso.
  assert.equal(revisarRegistro({ nombre: "x", ultimaLinea: EXITO_GUION, horasSinEscribir: 25, maxHoras: 26, horasDesdeElCrontab: 900 }), null);
});

test("el aviso nombra a cada uno y no se manda si no hay nada", () => {
  assert.equal(avisoDeProblemas([]), "", "sin problemas, silencio");

  const problemas = revisarRegistros([
    { nombre: "shift-reminder", ultimaLinea: FALLO_WRAPPER, horasSinEscribir: 0.1, maxHoras: 1, horasDesdeElCrontab: 900 },
    { nombre: "plan-reminder", ultimaLinea: FALLO_ENV, horasSinEscribir: 5, maxHoras: 26, horasDesdeElCrontab: 900 },
    { nombre: "attendance-axo-reminder", ultimaLinea: EXITO_ASISTENCIA, horasSinEscribir: 3, maxHoras: 26, horasDesdeElCrontab: 900 }
  ]);
  assert.equal(problemas.length, 2, "el sano no entra");

  const texto = avisoDeProblemas(problemas);
  assert.match(texto, /2 crons/);
  assert.match(texto, /shift-reminder/);
  assert.match(texto, /plan-reminder/);
  assert.equal(/attendance-axo/.test(texto), false, "no se nombra al que está bien");
});

test("deduce la cadencia de las expresiones REALES del crontab", () => {
  // Copiadas del `crontab -l` del servidor el 18 de septiembre de 2026.
  assert.equal(cadenciaEnHoras("*/15 * * * *"), 1, "cada 15 min: con una hora sin escribir ya hay algo raro");
  assert.equal(cadenciaEnHoras("5 * * * *"), 3, "cada hora");
  assert.equal(cadenciaEnHoras("0 1 * * *"), 26, "diario, con dos horas de margen");
  assert.equal(cadenciaEnHoras("30 16 * * *"), 26);
  assert.equal(cadenciaEnHoras("0 4 * * 0"), 7 * 24 + 12, "semanal");
  assert.equal(cadenciaEnHoras("15 18 * * 1,3,5"), (7 / 3) * 24 + 12, "lunes, miércoles y viernes");
  assert.equal(cadenciaEnHoras("* * * * *"), 1, "cada minuto");
});

test("una expresion que no se entiende NO inventa un margen", () => {
  /*
   * Devolver un número a ojo produciría avisos falsos sobre un cron que está
   * perfectamente bien, y a los dos días nadie lee los avisos. Sin cadencia se
   * sigue mirando si su última salida falló, que es lo que de verdad importa.
   */
  assert.equal(cadenciaEnHoras("no soy un cron"), null);
  assert.equal(cadenciaEnHoras(""), null);
  assert.equal(cadenciaEnHoras("0 4"), null);
});

test("un cron RECIEN programado que aun no le toca no se denuncia", () => {
  /*
   * El caso real: el aviso de energía corre lunes, miércoles y viernes a
   * mediodía, se programó ayer y su archivo todavía no existía. Denunciarlo
   * habría sido el primer aviso del vigilante — y un vigilante que grita el
   * primer día se ignora para siempre.
   */
  const recien = revisarRegistro({
    nombre: "energy-checklist-reminder",
    ultimaLinea: null,
    horasSinEscribir: null,
    maxHoras: 7 * 24 + 12,
    horasDesdeElCrontab: 20
  });
  assert.equal(recien, null, "todavía no le ha tocado correr");

  // Pero si ya pasó su turno con margen, sí se denuncia.
  const viejo = revisarRegistro({
    nombre: "energy-checklist-reminder",
    ultimaLinea: null,
    horasSinEscribir: null,
    maxHoras: 72,
    horasDesdeElCrontab: 500
  });
  assert.ok(viejo, "ya tuvo tiempo de sobra y nunca escribió");
  assert.equal(viejo.motivo, "nunca ha dejado salida");
});

test("sin saber cuando se programo, un log ausente NO se denuncia", () => {
  /*
   * ⚠️ En el servidor real esto es lo NORMAL: el usuario no puede fechar su
   * propio crontab --`/var/spool/cron/crontabs/` está cerrado incluso para su
   * dueño-- así que `horasDesdeElCrontab` llega en null. Se descubrió en la
   * primera prueba en seco: el vigilante denunció al aviso de energía, que
   * simplemente tenía su corrida dos horas más tarde.
   */
  const desconocido = revisarRegistro({
    nombre: "energy-checklist-reminder",
    ultimaLinea: null,
    horasSinEscribir: null,
    maxHoras: 72,
    horasDesdeElCrontab: null
  });
  assert.equal(desconocido, null, "no se grita lo que no se puede saber");

  // Pero no se pierde de vista: sale en el resumen del propio guion.
  const mudos = sinRastro([
    { nombre: "energy-checklist-reminder", ultimaLinea: null, horasSinEscribir: null, maxHoras: 72, horasDesdeElCrontab: null },
    { nombre: "plan-reminder", ultimaLinea: "[..] OK", horasSinEscribir: 2, maxHoras: 26, horasDesdeElCrontab: null }
  ]);
  assert.deepEqual(mudos, ["energy-checklist-reminder"]);
});

/*
 * ── Los crons que callan a propósito ──────────────────────────────────────
 *
 * El vigilante deduce «corrió» de que su log cambie de fecha, y no le queda
 * otra: desde fuera, un cron que corre callado y uno muerto se ven idénticos.
 *
 * ⚠️ Costó OCHO DÍAS de aviso falso. `gastos` corre cada minuto y solo escribe
 * cuando hay un gasto nuevo --su nombre lo dice-- así que al callarse el 21 de
 * septiembre el vigilante lo dio por muerto. Comprobado lanzándolo a mano:
 * salía en 0 sin escribir una línea.
 */

import { CALLAN_A_PROPOSITO } from "../lib/vigilancia-crons";

function registroMudo(nombre: string) {
  return {
    nombre,
    ultimaLinea: "lo que escribió la última vez",
    // Nueve días sin escribir, con cadencia de una hora: denuncia segura.
    horasSinEscribir: 24 * 9,
    maxHoras: 1,
    horasDesdeElCrontab: 24 * 30
  };
}

test("⚠️ un cron declarado mudo NO se denuncia", () => {
  assert.equal(revisarRegistro(registroMudo("gastos")), null);
});

test("⚠️ y uno que NO está declarado sigue denunciándose", () => {
  // La lista tiene que ser una excepción, no un agujero: si esto deja de
  // fallar, el vigilante se quedó ciego para todos.
  const problema = revisarRegistro(registroMudo("backup"));
  assert.ok(problema, "un cron mudo sin declarar tiene que salir en el aviso");
  assert.equal(problema?.nombre, "backup");
});

test("⚠️ cada excepción lleva su motivo escrito", () => {
  // Una excepción sin motivo es una que nadie se atreve a quitar.
  assert.ok(CALLAN_A_PROPOSITO.size > 0);
  for (const [nombre, motivo] of CALLAN_A_PROPOSITO) {
    assert.ok(motivo.trim().length > 20, `${nombre} está en la lista sin explicar por qué`);
  }
});
