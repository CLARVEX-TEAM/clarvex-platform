import assert from "node:assert/strict";
import test from "node:test";
import { holidayLabel, isHoliday, mexicanHolidays } from "../lib/holidays";

test("festivos de 2026 (LFT Art. 74)", () => {
  const dates = mexicanHolidays(2026).map((holiday) => holiday.date);
  assert.deepEqual(dates, [
    "2026-01-01", // Año Nuevo
    "2026-02-02", // 1er lunes de febrero
    "2026-03-16", // 3er lunes de marzo
    "2026-05-01", // Día del Trabajo
    "2026-09-16", // Independencia
    "2026-11-16", // 3er lunes de noviembre
    "2026-12-25"  // Navidad
  ]);
});

test("los festivos móviles se CALCULAN, no se escriben a mano", () => {
  // Una lista fija se pudre al año siguiente. Se comprueban varios años.
  assert.equal(mexicanHolidays(2027)[1].date, "2027-02-01"); // 1 feb 2027 es lunes
  assert.equal(mexicanHolidays(2028)[1].date, "2028-02-07"); // 1 feb 2028 es martes → 1er lunes = 7
  assert.equal(mexicanHolidays(2027)[2].date, "2027-03-15"); // 3er lunes de marzo
  assert.equal(mexicanHolidays(2027)[5].date, "2027-11-15"); // 3er lunes de noviembre
});

test("isHoliday reconoce el día", () => {
  assert.equal(isHoliday("2026-05-01"), true);
  assert.equal(isHoliday("2026-03-16"), true);
  assert.equal(isHoliday("2026-07-14"), false);
  assert.equal(isHoliday("2026-03-21"), false); // el natalicio se conmemora el 3er lunes, no el 21
});

test("holidayLabel da el nombre", () => {
  assert.equal(holidayLabel("2026-09-16"), "Independencia");
  assert.equal(holidayLabel("2026-12-25"), "Navidad");
  assert.equal(holidayLabel("2026-07-14"), null);
});
