import assert from "node:assert/strict";
import test from "node:test";
import { addYears, lftVacationDays, nextAnniversary, splitVacationDays, vacationEarnedBetween, yearsOfService } from "../lib/vacations";


const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

test("la tabla de la LFT (reforma 2023)", () => {
  assert.equal(lftVacationDays(1), 12);
  assert.equal(lftVacationDays(2), 14);
  assert.equal(lftVacationDays(3), 16);
  assert.equal(lftVacationDays(4), 18);
  assert.equal(lftVacationDays(5), 20);
  // Del sexto en adelante: +2 días por cada 5 años de servicio.
  assert.equal(lftVacationDays(6), 22);
  assert.equal(lftVacationDays(10), 22);
  assert.equal(lftVacationDays(11), 24);
  assert.equal(lftVacationDays(15), 24);
  assert.equal(lftVacationDays(16), 26);
  assert.equal(lftVacationDays(21), 28);
  assert.equal(lftVacationDays(26), 30);
});

test("antes del primer año no hay derecho", () => {
  // El derecho se gana AL CUMPLIR el año, no se acumula día a día.
  assert.equal(lftVacationDays(0), 0);
});

test("los años de servicio se cuentan completos", () => {
  const hire = day("2024-03-15");
  assert.equal(yearsOfService(hire, day("2025-03-14")), 0); // un día antes: aún no cumple
  assert.equal(yearsOfService(hire, day("2025-03-15")), 1); // el día del aniversario ya cuenta
  assert.equal(yearsOfService(hire, day("2026-07-14")), 2);
});

test("el 29 de febrero no rompe el aniversario", () => {
  // 2024 fue bisiesto; 2025 no. El aniversario cae el 28.
  const hire = day("2024-02-29");
  assert.equal(addYears(hire, 1).toISOString().slice(0, 10), "2025-02-28");
  assert.equal(addYears(hire, 4).toISOString().slice(0, 10), "2028-02-29"); // vuelve a ser bisiesto
  assert.equal(yearsOfService(hire, day("2025-02-28")), 1);
});

test("el próximo aniversario", () => {
  const hire = day("2024-03-15");
  assert.equal(nextAnniversary(hire, day("2026-07-14")).toISOString().slice(0, 10), "2027-03-15");
});

test("solo se ganan los días de los aniversarios POSTERIORES al corte", () => {
  const hire = day("2020-07-01");
  const corte = day("2026-07-14"); // ya cumplió 6 años (el 1 de julio)

  // Del corte a hoy no ha pasado ningún aniversario: no gana nada.
  assert.equal(vacationEarnedBetween(hire, corte, day("2026-12-31")), 0);

  // Al llegar el 1 de julio de 2027 cumple 7 años → 22 días.
  assert.equal(vacationEarnedBetween(hire, corte, day("2027-07-01")), 22);

  // Dos aniversarios después: 7 y 8 años → 22 + 22.
  assert.equal(vacationEarnedBetween(hire, corte, day("2028-07-01")), 44);
});

test("el aniversario del día del corte NO se vuelve a pagar", () => {
  // Si el corte se captura justo el día del aniversario, ese derecho ya está en el
  // número capturado. Volver a sumarlo lo contaría dos veces.
  const hire = day("2020-07-01");
  assert.equal(vacationEarnedBetween(hire, day("2026-07-01"), day("2026-12-31")), 0);
});

test("cruzar el escalón de la tabla suma lo correcto", () => {
  const hire = day("2021-01-10");
  // Corte al cumplir 4 años. Después llegan el 5º (20 días) y el 6º (22 días).
  const corte = day("2025-01-10");
  assert.equal(vacationEarnedBetween(hire, corte, day("2026-01-10")), 20);
  assert.equal(vacationEarnedBetween(hire, corte, day("2027-01-10")), 42);
});

test("un corte en el futuro no genera derecho", () => {
  const hire = day("2020-07-01");
  assert.equal(vacationEarnedBetween(hire, day("2027-01-01"), day("2026-12-31")), 0);
});

// ─── Qué días se descuentan ────────────────────────────────────────────────────

const CORTE = day("2026-07-01");
const HOY = day("2026-07-15");

test("las vacaciones PROGRAMADAS no se descuentan todavía", () => {
  // En Horarios se capturan con semanas de anticipación. Descontarlas de una vez
  // le quitaría al asesor días que aún no toma — y si el plan cambia, por nada.
  const days = splitVacationDays([
    { userId: "itzel", date: day("2026-07-20") },
    { userId: "itzel", date: day("2026-07-21") },
    { userId: "itzel", date: day("2026-08-03") }
  ], CORTE, HOY);
  assert.equal(days.get("itzel")?.taken, 0);
  assert.equal(days.get("itzel")?.planned, 3);
});

test("el día de hoy todavía NO se descuenta: no ha terminado", () => {
  const days = splitVacationDays([{ userId: "jazmin", date: HOY }], CORTE, HOY);
  assert.equal(days.get("jazmin")?.taken, 0);
  assert.equal(days.get("jazmin")?.planned, 1);
});

test("los días que ya pasaron sí se descuentan", () => {
  const days = splitVacationDays([
    { userId: "alonso", date: day("2026-07-10") },
    { userId: "alonso", date: day("2026-07-11") }
  ], CORTE, HOY);
  assert.equal(days.get("alonso")?.taken, 2);
  assert.equal(days.get("alonso")?.planned, 0);
});

test("lo anterior al corte no se cuenta: ya está en el saldo capturado", () => {
  const days = splitVacationDays([
    { userId: "waira", date: day("2026-06-20") }, // antes del corte
    { userId: "waira", date: CORTE },             // el día del corte
    { userId: "waira", date: day("2026-07-05") }  // después: este sí
  ], CORTE, HOY);
  assert.equal(days.get("waira")?.taken, 1);
});

test("un día en asistencia Y en horario cuenta UNA vez", () => {
  const days = splitVacationDays([
    { userId: "itzel", date: day("2026-07-10") }, // de Asistencia
    { userId: "itzel", date: day("2026-07-10") }  // el mismo, de Horarios
  ], CORTE, HOY);
  assert.equal(days.get("itzel")?.taken, 1);
});

test("cada quien con lo suyo", () => {
  const days = splitVacationDays([
    { userId: "itzel", date: day("2026-07-10") },
    { userId: "jazmin", date: day("2026-07-20") }
  ], CORTE, HOY);
  assert.equal(days.get("itzel")?.taken, 1);
  assert.equal(days.get("itzel")?.planned, 0);
  assert.equal(days.get("jazmin")?.taken, 0);
  assert.equal(days.get("jazmin")?.planned, 1);
});
