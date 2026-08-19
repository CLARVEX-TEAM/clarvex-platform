import assert from "node:assert/strict";
import test from "node:test";
import { paidDaysEarned, paidDaysEarnedInWeek, weekOf } from "../lib/paid-days";

const week = (...statuses: string[]) => statuses;
const full = (rests: number, extra: string[] = []) => {
  const days = Array.from({ length: rests }, () => "OFF");
  const rest = Array.from({ length: 7 - rests - extra.length }, () => "WORKING");
  return [...days, ...extra, ...rest];
};

test("dos descansos es lo normal: no se gana nada", () => {
  assert.equal(paidDaysEarnedInWeek(full(2)), 0);
});

test("un solo descanso gana un dia de pago", () => {
  // El caso real de la semana del 16 de agosto de 2026: cuatro personas
  // descansaron una vez y nadie se los habia sumado.
  assert.equal(paidDaysEarnedInWeek(full(1)), 1);
});

test("sin ningun descanso se ganan dos", () => {
  assert.equal(paidDaysEarnedInWeek(full(0)), 2);
});

test("descansar de mas no resta", () => {
  // Tres descansos no le quitan nada a nadie: el saldo no baja por descansar.
  assert.equal(paidDaysEarnedInWeek(full(3)), 0);
});

test("una semana ENTERA de vacaciones no genera nada", () => {
  // No hubo jornada que descansar. Contarla regalaria dos dias.
  assert.equal(paidDaysEarnedInWeek(week("VACATION", "VACATION", "VACATION", "VACATION", "VACATION", "VACATION", "VACATION")), 0);
});

test("una semana MIXTA con un solo descanso si genera", () => {
  // Trabajo aunque haya tomado vacaciones: el segundo descanso se le debe.
  assert.equal(paidDaysEarnedInWeek(week("VACATION", "VACATION", "VACATION", "OFF", "WORKING", "WORKING", "WORKING")), 1);
});

test("el dia de conteo cuenta como trabajado", () => {
  assert.equal(paidDaysEarnedInWeek(week("INVENTORY", "WORKING", "WORKING", "WORKING", "WORKING", "WORKING", "OFF")), 1);
});

test("tomar un pago de dia NO cuenta como descanso", () => {
  // Es consumo del saldo, no un descanso de la semana. Si contara, tomarse el
  // dia que se le debe cancelaria el derecho que lo genero.
  assert.equal(paidDaysEarnedInWeek(week("PAID_DAY", "OFF", "WORKING", "WORKING", "WORKING", "WORKING", "WORKING")), 1);
});

/* ─── Agrupado por semanas ───────────────────────────────────────────────── */

const days = (weekLabel: string, statuses: string[]) => statuses.map((status) => ({ week: weekLabel, status }));

/** Miercoles de la semana del 16 de agosto de 2026. */
const HOY = new Date("2026-08-19T00:00:00.000Z");

test("suma lo ganado de varias semanas", () => {
  const historia = [
    ...days("2026-08-02", full(2)),
    ...days("2026-08-09", full(2)),
    ...days("2026-08-16", full(1))
  ];
  assert.equal(paidDaysEarned(historia, HOY), 1);
});

test("una semana INCOMPLETA no se cuenta todavia", () => {
  // La semana en curso puede recibir un descanso el sabado. Darla por ganada el
  // martes le sumaria un dia que quiza no le toca.
  const enCurso = days("2026-08-16", ["WORKING", "WORKING", "WORKING"]);
  assert.equal(paidDaysEarned(enCurso, HOY), 0);
});

test("el domingo de la semana sale bien", () => {
  assert.equal(weekOf(new Date("2026-08-16T00:00:00.000Z")), "2026-08-16");
  assert.equal(weekOf(new Date("2026-08-22T00:00:00.000Z")), "2026-08-16");
  assert.equal(weekOf(new Date("2026-08-23T00:00:00.000Z")), "2026-08-23");
});

test("una semana FUTURA no cuenta, aunque venga completa", () => {
  // Los horarios estan capturados hasta fin de ano y esas semanas vienen con
  // siete dias laborables y ningun descanso, porque nadie las ha repartido
  // todavia. Contarlas daba 32 dias de pago en agosto.
  const futuro = days("2026-11-22", full(0));
  assert.equal(paidDaysEarned(futuro, HOY), 0);
});

test("la semana EN CURSO si cuenta: su reparto ya esta hecho", () => {
  const enCurso = days("2026-08-16", full(1));
  assert.equal(paidDaysEarned(enCurso, HOY), 1);
});

test("mezcla de pasadas, en curso y futuras", () => {
  const historia = [
    ...days("2026-08-09", full(2)),
    ...days("2026-08-16", full(1)),
    ...days("2026-12-06", full(0)),
    ...days("2026-12-13", full(0))
  ];
  assert.equal(paidDaysEarned(historia, HOY), 1);
});
