import assert from "node:assert/strict";
import test from "node:test";
import { diaAnterior, fechaIso, hora24, mezclarAsistencia, numeroLimpio, planDeMarcaje, type LecturaMarcaje } from "../lib/marcaje-pos";
import { leerJsonFoto } from "../lib/foto-bot-ia";
import { ordenDelForms, resumenParaForms } from "../lib/marcaje-forms";

// La foto real que mandó Adrián el 8 nov 2026: Eduardo marcando entrada.
const EDUARDO: LecturaMarcaje = {
  pantalla: "entrada",
  numeroEmpleado: "113642",
  fecha: "08/11/2026",
  hora: "10:43 a. m.",
  ultimaMarca: { accion: "salida", fecha: "07/11/2026", hora: "09:17 p. m." }
};

test("las horas del POS pasan a 24 h", () => {
  assert.equal(hora24("10:43 a. m."), "10:43");
  assert.equal(hora24("09:17 p. m."), "21:17");
  assert.equal(hora24("12:05 p. m."), "12:05");
  assert.equal(hora24("12:05 a. m."), "00:05");
  assert.equal(hora24("9:05 PM"), "21:05");
  assert.equal(hora24("21:05"), "21:05");
  assert.equal(hora24("13:00 p. m."), null);
  assert.equal(hora24("10:61 a. m."), null);
  assert.equal(hora24(null), null);
});

test("las fechas del POS son día/mes/año y tienen que existir", () => {
  assert.equal(fechaIso("08/11/2026"), "2026-11-08");
  assert.equal(fechaIso("8/1/2026"), "2026-01-08");
  assert.equal(fechaIso("31/02/2026"), null);
  assert.equal(fechaIso("2026-11-08"), null);
  assert.equal(diaAnterior("2026-11-01"), "2026-10-31");
});

test("el número se limpia de espacios y guiones", () => {
  assert.equal(numeroLimpio(" 113 642 "), "113642");
  assert.equal(numeroLimpio("ab"), null);
});

test("la foto real registra la entrada de hoy y la salida REAL de ayer", () => {
  const plan = planDeMarcaje(EDUARDO, "2026-11-08");
  assert.ok(plan.ok);
  assert.equal(plan.numeroEmpleado, "113642");
  assert.deepEqual(plan.escrituras, [
    { fecha: "2026-11-08", campo: "arrivedAt", hora: "10:43", soloSiFalta: false },
    { fecha: "2026-11-07", campo: "leftAt", hora: "21:17", soloSiFalta: false }
  ]);
});

test("una foto de otro día NO registra nada", () => {
  const plan = planDeMarcaje(EDUARDO, "2026-11-09");
  assert.deepEqual(plan, { ok: false, motivo: "otro-dia", fecha: "2026-11-08" });
});

test("si falta el número, la fecha o la hora, se pide otra foto", () => {
  assert.deepEqual(planDeMarcaje({ ...EDUARDO, numeroEmpleado: null }, "2026-11-08"), { ok: false, motivo: "ilegible" });
  assert.deepEqual(planDeMarcaje({ ...EDUARDO, hora: "10:4" }, "2026-11-08"), { ok: false, motivo: "ilegible" });
  assert.deepEqual(planDeMarcaje({ ...EDUARDO, pantalla: null, ultimaMarca: null }, "2026-11-08"), { ok: false, motivo: "ilegible" });
});

test("una última salida que no es de ayer no se toca", () => {
  const plan = planDeMarcaje({ ...EDUARDO, ultimaMarca: { accion: "salida", fecha: "05/11/2026", hora: "09:00 p. m." } }, "2026-11-08");
  assert.ok(plan.ok);
  assert.equal(plan.escrituras.length, 1);
});

test("la pantalla de SALIDA registra la salida y completa la entrada solo si falta", () => {
  const plan = planDeMarcaje(
    { pantalla: "salida", numeroEmpleado: "113642", fecha: "08/11/2026", hora: "09:02 p. m.", ultimaMarca: { accion: "entrada", fecha: "08/11/2026", hora: "10:43 a. m." } },
    "2026-11-08"
  );
  assert.ok(plan.ok);
  assert.deepEqual(plan.escrituras, [
    { fecha: "2026-11-08", campo: "leftAt", hora: "21:02", soloSiFalta: false },
    { fecha: "2026-11-08", campo: "arrivedAt", hora: "10:43", soloSiFalta: true }
  ]);
  const conEntrada = mezclarAsistencia({ arrivedAt: "10:40", lunchStart: null, leftAt: null, entryText: null, note: null }, plan.escrituras);
  assert.equal(conEntrada.arrivedAt, "10:40", "lo deducido del Estado no pisa lo capturado");
  assert.equal(conEntrada.leftAt, "21:02");
});

test("mezclar NUNCA borra lo que ya había en la fila", () => {
  const fila = mezclarAsistencia(
    { arrivedAt: "10:30", lunchStart: "15:00", leftAt: "21:00", entryText: null, note: "corregida" },
    [{ fecha: "2026-11-07", campo: "leftAt", hora: "21:17", soloSiFalta: false }]
  );
  assert.equal(fila.arrivedAt, "10:30");
  assert.equal(fila.lunchStart, "15:00");
  assert.equal(fila.leftAt, "21:17");
  assert.equal(fila.note, "corregida");
  assert.equal(fila.cambios.length, 1);
});

test("una entrada del POS quita un FALTA que estaba puesto", () => {
  const fila = mezclarAsistencia({ arrivedAt: null, lunchStart: null, leftAt: null, entryText: "FALTA", note: null }, [
    { fecha: "2026-11-08", campo: "arrivedAt", hora: "10:43", soloSiFalta: false }
  ]);
  assert.equal(fila.entryText, null);
  assert.equal(fila.arrivedAt, "10:43");
});

test("mandar la misma foto dos veces no cambia nada", () => {
  const fila = mezclarAsistencia({ arrivedAt: "10:43", lunchStart: null, leftAt: null, entryText: null, note: null }, [
    { fecha: "2026-11-08", campo: "arrivedAt", hora: "10:43", soloSiFalta: false }
  ]);
  assert.equal(fila.cambios.length, 0);
});

test("la respuesta de la IA se lee aunque venga con ``` y valores raros", () => {
  const lectura = leerJsonFoto('```json\n{"tipo":"marcaje","pantalla":"entrada","numeroEmpleado":"113642","fecha":"08/11/2026","hora":"10:43 a. m.","ultimaMarca":{"accion":"salida","fecha":"07/11/2026","hora":"09:17 p. m."}}\n```');
  assert.deepEqual(lectura, { tipo: "marcaje", marcaje: EDUARDO });
  assert.deepEqual(leerJsonFoto('{"tipo":"certificado"}'), { tipo: "certificado", marcaje: null });
  assert.deepEqual(leerJsonFoto('{"tipo":"selfie"}'), { tipo: "otra", marcaje: null });
  assert.equal(leerJsonFoto("no sé"), null);
});

test("el paquete del Forms va en su orden y nombra a quien falta", () => {
  const lugares = ordenDelForms(
    [
      { userId: "w", name: "WAIRA ZITLAL POPOCA", role: "ASESOR", expectedAt: "12:00" },
      { userId: "e", name: "EDUARDO ALONSO", role: "ASESOR", expectedAt: "10:30" },
      { userId: "a", name: "JESUS ADRIAN HERNANDEZ", role: "SUBGERENTE", expectedAt: "10:30" },
      { userId: "i", name: "ITZEL", role: "GERENTE", expectedAt: "11:00" }
    ],
    [{ userId: "e", hora: "10:43", url: "u", mimeType: "image/jpeg" }]
  );
  assert.deepEqual(lugares.map((l) => `${l.etiqueta}:${l.nombre}`), ["Gerente:Itzel", "Subgerente:Jesus", "Asesor 1:Eduardo", "Asesor 2:Waira"]);
  const texto = resumenParaForms(lugares);
  assert.match(texto, /✅ Asesor 1 — Eduardo \(10:43\)/);
  assert.match(texto, /Falta foto de: \*Itzel, Jesus, Waira\*/);
});

// Las dos fotos reales del 9 nov 2026 que el título engañaba.
test("Waira: foto recortada sin título, la IA dice «salida», pero el Estado dice que es la ENTRADA", () => {
  const plan = planDeMarcaje(
    { pantalla: "salida", numeroEmpleado: "100200", fecha: "09/11/2026", hora: "10:43 a. m.", ultimaMarca: { accion: "salida", fecha: "08/11/2026", hora: "09:00 p. m." } },
    "2026-11-09"
  );
  assert.ok(plan.ok);
  assert.equal(plan.pantalla, "entrada");
  assert.deepEqual(plan.escrituras, [
    { fecha: "2026-11-09", campo: "arrivedAt", hora: "10:43", soloSiFalta: false },
    { fecha: "2026-11-08", campo: "leftAt", hora: "21:00", soloSiFalta: false }
  ]);
});

test("Alonso: la pantalla de DESPUÉS de marcar entrada es la foto de esa entrada, no una salida", () => {
  const plan = planDeMarcaje(
    { pantalla: "salida", numeroEmpleado: "113642", fecha: "09/11/2026", hora: "10:44 a. m.", ultimaMarca: { accion: "entrada", fecha: "09/11/2026", hora: "10:44 a. m." } },
    "2026-11-09"
  );
  assert.ok(plan.ok);
  assert.equal(plan.pantalla, "entrada");
  assert.equal(plan.hora, "10:44");
  assert.deepEqual(plan.escrituras, [{ fecha: "2026-11-09", campo: "arrivedAt", hora: "10:44", soloSiFalta: false }]);
});

test("una salida de verdad, horas después de la entrada, sigue siendo salida", () => {
  const plan = planDeMarcaje(
    { pantalla: "entrada", numeroEmpleado: "113642", fecha: "09/11/2026", hora: "09:02 p. m.", ultimaMarca: { accion: "entrada", fecha: "09/11/2026", hora: "10:44 a. m." } },
    "2026-11-09"
  );
  assert.ok(plan.ok);
  assert.equal(plan.pantalla, "salida");
  assert.equal(plan.escrituras[0].campo, "leftAt");
  assert.equal(plan.escrituras[0].hora, "21:02");
});

test("sin Estado legible, manda el título", () => {
  const plan = planDeMarcaje({ ...EDUARDO, ultimaMarca: null }, "2026-11-08");
  assert.ok(plan.ok);
  assert.equal(plan.pantalla, "entrada");
});
