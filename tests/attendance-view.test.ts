import assert from "node:assert/strict";
import test from "node:test";
import { totalsByUser, totalsFor, type AttendanceRecord } from "../lib/attendance-view";

function record(partial: Partial<AttendanceRecord> & Pick<AttendanceRecord, "date" | "status">): AttendanceRecord {
  return {
    id: `r-${partial.date}-${partial.userId ?? "u1"}`,
    userId: partial.userId ?? "u1",
    expectedAt: "10:30",
    arrivedAt: null,
    minutesLate: 0,
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
