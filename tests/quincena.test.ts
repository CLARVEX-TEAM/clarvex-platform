import assert from "node:assert/strict";
import test from "node:test";
import type { AttendanceRecord } from "../lib/attendance-view";
import { RETARDO_LIMIT, countLates, manualCorrections, retardoStatus } from "../lib/quincena";

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

test("sin retardos: verde y con todo el margen", () => {
  const status = retardoStatus(0);
  assert.equal(status.tone, "ok");
  assert.equal(status.remaining, RETARDO_LIMIT);
  assert.equal(status.nextIsPenalty, false);
});

test("un retardo (límite 3): sigue en verde con margen", () => {
  const status = retardoStatus(1);
  assert.equal(status.tone, "ok");
  assert.equal(status.remaining, 2);
  assert.equal(status.nextIsPenalty, false);
});

test("dos retardos: ámbar y el siguiente cuesta el día", () => {
  const status = retardoStatus(2);
  assert.equal(status.tone, "warn");
  assert.equal(status.remaining, 1);
  assert.equal(status.nextIsPenalty, true);
});

test("tres retardos: rojo, en el límite", () => {
  const status = retardoStatus(3);
  assert.equal(status.tone, "danger");
  assert.equal(status.remaining, 0);
});

test("countLates solo cuenta los LATE del periodo", () => {
  const records = [
    record({ date: "2026-07-01", status: "LATE" }),
    record({ date: "2026-07-02", status: "ON_TIME" }),
    record({ date: "2026-07-03", status: "LATE" }),
    record({ date: "2026-07-04", status: "ABSENT" }),
    record({ date: "2026-07-05", status: "REST" })
  ];
  assert.equal(countLates(records), 2);
});

test("manualCorrections: solo las MANUAL, más recientes primero", () => {
  const records = [
    record({ date: "2026-07-01", status: "LATE", source: "APERTURA_XLSX" }),
    record({ date: "2026-07-02", status: "ON_TIME", source: "MANUAL", note: "llegada justificada" }),
    record({ date: "2026-07-08", status: "EXCUSED", source: "MANUAL", note: "permiso médico" })
  ];
  const corrections = manualCorrections(records);
  assert.equal(corrections.length, 2);
  assert.equal(corrections[0].date, "2026-07-08");
  assert.equal(corrections[1].date, "2026-07-02");
});
