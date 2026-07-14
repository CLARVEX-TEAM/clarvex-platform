import assert from "node:assert/strict";
import test from "node:test";
import { lastSaturdayOfMonth, reminderFor } from "../lib/report-deadlines";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

test("último sábado del mes", () => {
  // Julio 2026: el 31 es viernes → el último sábado es el 25.
  assert.equal(lastSaturdayOfMonth(2026, 6).toISOString().slice(0, 10), "2026-07-25");
  // Agosto 2026: el 31 es lunes → último sábado, el 29.
  assert.equal(lastSaturdayOfMonth(2026, 7).toISOString().slice(0, 10), "2026-08-29");
  // Febrero 2026: el 28 es sábado → ese mismo.
  assert.equal(lastSaturdayOfMonth(2026, 1).toISOString().slice(0, 10), "2026-02-28");
});

test("avisa 3 días antes del último sábado, y el mismo día", () => {
  // El último sábado de julio 2026 es el 25.
  assert.equal(reminderFor(day("2026-07-21")), null);       // 4 días antes: aún no
  assert.equal(reminderFor(day("2026-07-22"))?.kind, "MES"); // 3 días antes
  assert.equal(reminderFor(day("2026-07-25"))?.daysLeft, 0); // el mismo día
  assert.equal(reminderFor(day("2026-07-26")), null);       // ya pasó: no sirve avisar
});

test("el aviso del mes dice cuántos días faltan", () => {
  assert.match(reminderFor(day("2026-07-24"))!.message, /en 1 día/);
  assert.match(reminderFor(day("2026-07-25"))!.message, /es HOY/);
  assert.match(reminderFor(day("2026-07-23"))!.message, /Blitz/);
});

test("avisa el cierre de quincena (día 15 y último del mes)", () => {
  assert.equal(reminderFor(day("2026-07-15"))?.kind, "QUINCENA");
  assert.equal(reminderFor(day("2026-07-31"))?.kind, "QUINCENA");
  assert.match(reminderFor(day("2026-07-15"))!.message, /faltas/);
});

test("un día cualquiera no molesta a nadie", () => {
  assert.equal(reminderFor(day("2026-07-14")), null);
  assert.equal(reminderFor(day("2026-07-08")), null);
});
