import assert from "node:assert/strict";
import test from "node:test";
import { calculateFairQuota, suggestedPercentages } from "../lib/fair-quota";

const people = [
  { userId: "g", name: "Gerente", role: "GERENTE" as const },
  { userId: "s", name: "Subgerente", role: "SUBGERENTE" as const },
  { userId: "a1", name: "Asesor 1", role: "ASESOR" as const },
  { userId: "a2", name: "Asesor 2", role: "ASESOR" as const }
];

test("reparte 10/15 y divide el remanente entre asesores presentes", () => {
  assert.deepEqual(suggestedPercentages(people, new Set(people.map((person) => person.userId))), {
    g: 10, s: 15, a1: 37.5, a2: 37.5
  });
});

test("los porcentajes y metas se ajustan automáticamente por día", () => {
  const result = calculateFairQuota({
    dates: ["2026-08-23", "2026-08-24"], people,
    minimums: { "2026-08-23": 10_000, "2026-08-24": 9_000 },
    presence: { "2026-08-23": ["g", "s", "a1", "a2"], "2026-08-24": ["s", "a1"] },
    whatsappBudget: 700
  });
  assert.equal(result.days[0].storeGoal, 11_500);
  assert.equal(result.days[0].percentageTotal, 100);
  assert.equal(result.days[1].allocations.find((item) => item.userId === "s")?.percentage, 15);
  assert.equal(result.days[1].allocations.find((item) => item.userId === "a1")?.percentage, 85);
  assert.equal(result.days[1].allocations.find((item) => item.userId === "g")?.goal, 0);
  assert.equal(result.storeTotal, 21_850);
});

test("si solo está gerencia redistribuye el 100 % proporcionalmente", () => {
  const shares = suggestedPercentages(people, new Set(["g", "s"]));
  assert.equal(shares.g, 40);
  assert.equal(shares.s, 60);
});

test("el redondeo monetario conserva exactamente el total del día", () => {
  const result = calculateFairQuota({
    dates: ["2026-08-23"], people,
    minimums: { "2026-08-23": 100 }, presence: { "2026-08-23": ["a1", "a2"] }
  });
  assert.equal(result.days[0].allocations.reduce((sum, item) => sum + item.goal, 0), result.days[0].storeGoal);
});

test("rechaza porcentajes manuales que no suman 100", () => {
  assert.throws(() => calculateFairQuota({
    dates: ["2026-08-23"], people,
    minimums: { "2026-08-23": 100 }, presence: { "2026-08-23": ["a1", "a2"] },
    percentages: { "2026-08-23": { g: 0, s: 0, a1: 40, a2: 50 } }
  }), /deben sumar 100/);
});

test("rechaza asignar porcentaje a quien no labora", () => {
  assert.throws(() => calculateFairQuota({
    dates: ["2026-08-23"], people,
    minimums: { "2026-08-23": 100 }, presence: { "2026-08-23": ["a1"] },
    percentages: { "2026-08-23": { g: 0, s: 0, a1: 90, a2: 10 } }
  }), /no labora/);
});
