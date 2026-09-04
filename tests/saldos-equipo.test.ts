import assert from "node:assert/strict";
import test from "node:test";
import { horasLegibles } from "../components/desktop/SaldosEquipo";

test("un saldo a favor se lee en horas y minutos", () => {
  assert.equal(horasLegibles(90), "1h 30m");
  assert.equal(horasLegibles(120), "2h");
  assert.equal(horasLegibles(45), "45m");
  assert.equal(horasLegibles(0), "0m");
});

test("⚠️ un saldo NEGATIVO se ve como negativo", () => {
  /*
   * Se debe tiempo, y eso tiene que verse. Perder el signo convierte una deuda
   * de hora y media en un saldo a favor de hora y media, que es la lectura
   * contraria y la que se lleva a nomina.
   */
  assert.equal(horasLegibles(-90), "−1h 30m");
  assert.equal(horasLegibles(-30), "−30m");
  assert.equal(horasLegibles(-60), "−1h");
});

test("el caso real del pase de lista: 90 minutos tarde", () => {
  // La regla de asistencia descuenta la diferencia completa desde +30 min. Una
  // llegada de 90 minutos deja el banco en -90.
  assert.equal(horasLegibles(-90), "−1h 30m");
});

test("⚠️ no se confunden minutos con horas", () => {
  /*
   * `User.hoursOwed` esta en HORAS y el saldo en MINUTOS. Pasar 8 --ocho horas
   * de saldo-- donde se esperan minutos daria «8m» en vez de «8h»: un error de
   * sesenta veces que no rompe nada y se lee como si fuera correcto. Por eso el
   * campo se llama `hoursBalanceMinutes` y no `hours`.
   */
  assert.equal(horasLegibles(8), "8m");
  assert.equal(horasLegibles(8 * 60), "8h");
  assert.notEqual(horasLegibles(8), horasLegibles(8 * 60));
});

test("jornadas largas no se colapsan en el reloj", () => {
  // 25 h no son «1h»: el saldo se acumula por encima de un dia entero.
  assert.equal(horasLegibles(25 * 60), "25h");
  assert.equal(horasLegibles(25 * 60 + 15), "25h 15m");
});
