import assert from "node:assert/strict";
import test from "node:test";
import { dayBalanceMinutes, formatBalance, totalBalanceMinutes } from "../lib/hours-balance";

// Horario estándar de la tienda: 10:30 a 21:00.
const day = (arrivedAt: string | null, leftAt: string | null, status = "ON_TIME" as const) =>
  ({ status, arrivedAt, leftAt, expectedEntry: "10:30", expectedExit: "21:00" });

test("entrar temprano SUMA horas a favor", () => {
  // "si un día entramos a las 8 pues ya sumamos 2 horas y media más"
  assert.equal(dayBalanceMinutes(day("08:00", "21:00")), 150); // +2:30
  assert.equal(formatBalance(150), "+2:30");
});

test("salir temprano RESTA horas", () => {
  // "si salimos a las 7 pues nos quita dos horas"
  assert.equal(dayBalanceMinutes(day("10:30", "19:00")), -120); // −2:00
  assert.equal(formatBalance(-120), "−2:00");
});

test("entrar tarde también resta", () => {
  assert.equal(dayBalanceMinutes(day("11:00", "21:00")), -30); // −0:30
});

test("quedarse más tarde suma", () => {
  assert.equal(dayBalanceMinutes(day("10:30", "22:00")), 60); // +1:00
  assert.equal(formatBalance(60), "+1:00");
});

test("un día exacto no mueve el saldo", () => {
  assert.equal(dayBalanceMinutes(day("10:30", "21:00")), 0);
  assert.equal(formatBalance(0), "+0:00");
});

test("las dos puntas se suman", () => {
  // Entra 1 h antes y se va 1 h después: 2 h a favor.
  assert.equal(dayBalanceMinutes(day("09:30", "22:00")), 120);
  // Entra tarde Y se va temprano: castigo doble.
  assert.equal(dayBalanceMinutes(day("11:00", "20:00")), -90); // −0:30 − 1:00
});

test("si no marcó salida NO se le castiga con un saldo enorme", () => {
  // Solo se cuenta la punta capturada, igual que el ISNUMBER() del Excel.
  // Sin esta guarda, no marcar salida daría −21:00 de golpe.
  assert.equal(dayBalanceMinutes(day("10:30", null)), 0);
  assert.equal(dayBalanceMinutes(day("08:00", null)), 150); // solo la entrada
});

test("descanso, vacaciones y falta no generan saldo", () => {
  assert.equal(dayBalanceMinutes({ ...day(null, null), status: "REST" }), 0);
  assert.equal(dayBalanceMinutes({ ...day(null, null), status: "VACATION" }), 0);
  assert.equal(dayBalanceMinutes({ ...day(null, null), status: "PAID_DAY" }), 0);
  // Una falta se reporta como falta; no se convierte además en horas debidas.
  assert.equal(dayBalanceMinutes({ ...day(null, null), status: "ABSENT" }), 0);
});

test("el acumulado suma los días", () => {
  const total = totalBalanceMinutes([
    day("08:00", "21:00"),  // +2:30
    day("10:30", "19:00"),  // −2:00
    day("10:30", "21:00"),  // 0
    { ...day(null, null), status: "REST" } // 0
  ]);
  assert.equal(total, 30);
  assert.equal(formatBalance(total), "+0:30");
});

test("formatBalance usa el mismo formato que la hoja CONTROL HORAS", () => {
  assert.equal(formatBalance(240), "+4:00");   // el saldo de Itzel en el Excel
  assert.equal(formatBalance(90), "+1:30");    // el de Waira
  assert.equal(formatBalance(-60), "−1:00");
  assert.equal(formatBalance(5), "+0:05");
});
