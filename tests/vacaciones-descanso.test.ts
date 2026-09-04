import assert from "node:assert/strict";
import test from "node:test";
import { soloLasQueHorariosConfirma, splitVacationDays } from "../lib/vacations";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dia = (fecha: string) => ({ userId: "waira", date: d(fecha) });
const horario = (fecha: string, status: string) => ({ userId: "waira", date: d(fecha), status });

test("⚠️ el caso de Waira: un DESCANSO dentro de vacaciones no gasta un dia", () => {
  /*
   * Julio de 2026. Asistencia marco VACATION el tramo entero, del 15 al 30, con
   * los descansos de en medio incluidos. Horarios --que es la fuente de verdad
   * de que es cada dia-- dice DESCANSO el 19, el 20, el 29 y el 30.
   *
   * Tomo 12 dias de vacaciones. El saldo le restaba 16 y la dejaba en 0 cuando
   * le quedaban 4.
   */
  const asistencia = [
    "2026-07-15","2026-07-16","2026-07-17","2026-07-18","2026-07-19","2026-07-20",
    "2026-07-21","2026-07-22","2026-07-23","2026-07-24","2026-07-25","2026-07-26",
    "2026-07-27","2026-07-28","2026-07-29","2026-07-30"
  ].map(dia);

  const horarios = [
    ...["2026-07-15","2026-07-16","2026-07-17","2026-07-18","2026-07-21","2026-07-22",
        "2026-07-23","2026-07-24","2026-07-25","2026-07-26","2026-07-27","2026-07-28"]
      .map((f) => horario(f, "VACATION")),
    ...["2026-07-19","2026-07-20","2026-07-29","2026-07-30"].map((f) => horario(f, "OFF"))
  ];

  const confirmados = soloLasQueHorariosConfirma(asistencia, horarios);
  assert.equal(confirmados.length, 12, "deberian quedar 12 dias, no 16");

  const reparto = splitVacationDays(confirmados, d("2026-07-14"), d("2026-09-04"));
  assert.equal(reparto.get("waira")?.taken, 12);

  // 16 de saldo base menos 12 tomados = los 4 que le quedan.
  assert.equal(16 - (reparto.get("waira")?.taken ?? 0), 4);
});

test("un dia SIN fila en Horarios se conserva", () => {
  // Ahi Asistencia es lo unico que hay; descartarlo perderia vacaciones reales.
  const confirmados = soloLasQueHorariosConfirma([dia("2026-08-03")], []);
  assert.equal(confirmados.length, 1);
});

test("si Horarios dice VACATION, cuenta", () => {
  const confirmados = soloLasQueHorariosConfirma(
    [dia("2026-08-03")],
    [horario("2026-08-03", "VACATION")]
  );
  assert.equal(confirmados.length, 1);
});

test("cualquier otro estado de Horarios lo descarta", () => {
  // No solo el descanso: si ese dia se trabajo, o fue pago de dia, tampoco
  // gasta vacaciones.
  for (const estado of ["OFF", "WORKING", "PAID_DAY", "INVENTORY"]) {
    const confirmados = soloLasQueHorariosConfirma(
      [dia("2026-08-03")],
      [horario("2026-08-03", estado)]
    );
    assert.equal(confirmados.length, 0, `${estado} no deberia contar`);
  }
});

test("no se cruzan las personas", () => {
  // El descanso de una no puede tapar las vacaciones de otra.
  const confirmados = soloLasQueHorariosConfirma(
    [{ userId: "waira", date: d("2026-08-03") }, { userId: "jazmin", date: d("2026-08-03") }],
    [{ userId: "waira", date: d("2026-08-03"), status: "OFF" }]
  );
  assert.deepEqual(confirmados.map((f) => f.userId), ["jazmin"]);
});
