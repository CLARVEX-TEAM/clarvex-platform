import assert from "node:assert/strict";
import test from "node:test";
import { fortnightOf, incidentsFor, totalsByUser, totalsFor, type AttendanceRecord } from "../lib/attendance-view";

function record(partial: Partial<AttendanceRecord> & Pick<AttendanceRecord, "date" | "status">): AttendanceRecord {
  return {
    id: `r-${partial.date}-${partial.userId ?? "u1"}`,
    userId: partial.userId ?? "u1",
    expectedAt: "10:30",
    expectedLeaveAt: "21:00",
    arrivedAt: null,
    leftAt: null,
    minutesLate: 0,
    minutesBalance: 0,
    entryText: null,
    source: "APERTURA_XLSX",
    note: null,
    ...partial
  };
}

test("los totales del mes son los que se reportan a nómina", () => {
  const totals = totalsFor([
    record({ date: "2026-07-13", status: "ON_TIME", arrivedAt: "10:35", minutesLate: 5 }),
    record({ date: "2026-07-14", status: "LATE", arrivedAt: "10:45", minutesLate: 15 }),
    record({ date: "2026-07-15", status: "LATE", arrivedAt: "10:50", minutesLate: 20 }),
    record({ date: "2026-07-16", status: "ABSENT" }),
    record({ date: "2026-07-17", status: "REST" })
  ]);

  assert.equal(totals.absences, 1);
  assert.equal(totals.lates, 2);
  assert.equal(totals.minutesLate, 35); // 15 + 20
});

test("prima dominical: solo cuentan los domingos TRABAJADOS", () => {
  const totals = totalsFor([
    record({ date: "2026-07-05", status: "ON_TIME" }), // domingo trabajado
    record({ date: "2026-07-12", status: "LATE" }),    // domingo: llegó tarde, pero trabajó
    record({ date: "2026-07-19", status: "REST" }),    // domingo: descansó → no cuenta
    record({ date: "2026-07-26", status: "ABSENT" }),  // domingo: no se presentó → no cuenta
    record({ date: "2026-07-13", status: "ON_TIME" })  // lunes → no cuenta
  ]);
  assert.equal(totals.sundaysWorked, 2);
});

test("un día a tiempo con minutos negativos (llegó antes) no suma retardo", () => {
  const totals = totalsFor([record({ date: "2026-07-14", status: "ON_TIME", arrivedAt: "08:30", minutesLate: -120 })]);
  assert.equal(totals.lates, 0);
  assert.equal(totals.minutesLate, 0); // no se resta: no existen retardos negativos
});

test("descanso, vacaciones, pago de día y permiso NO son faltas", () => {
  const totals = totalsFor([
    record({ date: "2026-07-13", status: "REST" }),
    record({ date: "2026-07-14", status: "VACATION" }),
    record({ date: "2026-07-15", status: "PAID_DAY" }),
    record({ date: "2026-07-16", status: "INVENTORY" }),
    record({ date: "2026-07-17", status: "EXCUSED" })
  ]);
  assert.equal(totals.absences, 0);
  assert.equal(totals.lates, 0);
});

test("festivo trabajado cuenta; festivo descansado no", () => {
  // 16-sep-2026 (Independencia) y 25-dic-2026 (Navidad) son festivos de ley.
  const totals = totalsFor([
    record({ date: "2026-09-16", status: "ON_TIME" }),  // trabajó el festivo
    record({ date: "2026-12-25", status: "REST" }),     // lo descansó → no cuenta
    record({ date: "2026-09-17", status: "ON_TIME" })   // día normal
  ]);
  assert.equal(totals.holidaysWorked, 1);
});

test("las incidencias salen listas para capturar en Blitz", () => {
  const incidents = incidentsFor([
    record({ date: "2026-07-14", status: "LATE", arrivedAt: "10:45", minutesLate: 15 }),
    record({ date: "2026-07-16", status: "ABSENT" }),
    record({ date: "2026-07-12", status: "ON_TIME" }) // domingo trabajado
  ]);

  // Ordenadas por fecha: el domingo 12 primero.
  assert.deepEqual(incidents.map((incident) => [incident.date, incident.kind]), [
    ["2026-07-12", "DOMINGO"],
    ["2026-07-14", "RETARDO"],
    ["2026-07-16", "FALTA"]
  ]);
  // El retardo trae el detalle ya masticado: no hay que volver a calcular nada.
  assert.match(incidents[1].detail, /10:45.*\+15 min/);
});

test("un día normal no genera ninguna incidencia", () => {
  const incidents = incidentsFor([
    record({ date: "2026-07-14", status: "ON_TIME", arrivedAt: "10:35" }),
    record({ date: "2026-07-15", status: "REST" })
  ]);
  assert.equal(incidents.length, 0);
});

test("la quincena parte el mes en 1-15 y 16-fin", () => {
  assert.equal(fortnightOf("2026-07-01"), 1);
  assert.equal(fortnightOf("2026-07-15"), 1);
  assert.equal(fortnightOf("2026-07-16"), 2);
  assert.equal(fortnightOf("2026-07-31"), 2);
});

test("los totales se separan por colaborador", () => {
  const byUser = totalsByUser([
    record({ userId: "itzel", date: "2026-07-13", status: "LATE", minutesLate: 15 }),
    record({ userId: "itzel", date: "2026-07-14", status: "ABSENT" }),
    record({ userId: "jazmin", date: "2026-07-13", status: "ON_TIME" })
  ]);

  assert.equal(byUser.get("itzel")?.absences, 1);
  assert.equal(byUser.get("itzel")?.lates, 1);
  assert.equal(byUser.get("jazmin")?.absences, 0);
  assert.equal(byUser.get("jazmin")?.lates, 0);
});
