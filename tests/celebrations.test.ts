import assert from "node:assert/strict";
import test from "node:test";
import { daysUntilMonthDay, isSameMonthDay, upcomingCelebrations, yearsSince } from "../lib/celebrations";

const TODAY = "2026-06-14";

test("isSameMonthDay ignora el año", () => {
  assert.equal(isSameMonthDay("1990-06-14", TODAY), true);
  assert.equal(isSameMonthDay("1990-06-15", TODAY), false);
});

test("daysUntilMonthDay: hoy = 0, futuro proximo y cruce de año", () => {
  assert.equal(daysUntilMonthDay("1990-06-14", TODAY), 0);
  assert.equal(daysUntilMonthDay("1990-06-20", TODAY), 6);
  assert.equal(daysUntilMonthDay("1990-06-10", TODAY), daysUntilMonthDay("1990-06-10", TODAY)); // proxima ocurrencia ~ año siguiente
  assert.ok(daysUntilMonthDay("1990-06-10", TODAY) > 300);
});

test("yearsSince calcula la antiguedad/edad", () => {
  assert.equal(yearsSince("2020-06-14", TODAY), 6);
});

test("upcomingCelebrations lista cumples y aniversarios dentro del rango", () => {
  const people = [
    { id: "a", name: "Ana", birthDate: "1995-06-14" },          // cumple hoy
    { id: "b", name: "Beto", birthDate: "1990-06-20" },         // cumple en 6 dias
    { id: "c", name: "Caro", hireDate: "2023-06-16" },          // aniversario en 2 dias (3 años)
    { id: "d", name: "Dani", birthDate: "1990-01-01" },         // fuera del rango de 30 dias
    { id: "e", name: "Edu", hireDate: "2026-06-15" }            // ingreso reciente, < 1 año -> no aniversario
  ];
  const result = upcomingCelebrations(people, TODAY, 30);
  assert.deepEqual(result.map((r) => r.id), ["a", "c", "b"]);
  assert.equal(result[0].type, "cumple");
  assert.equal(result[0].daysUntil, 0);
  assert.equal(result[1].type, "aniversario");
  assert.equal(result[1].years, 3);
});
