import assert from "node:assert/strict";
import test from "node:test";
import { calculateFairQuota, suggestedPercentages , podarPorcentajesCaducados } from "../lib/fair-quota";

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

/* ─── el borrador que se quedó viejo ──────────────────────────────────────── */

const GENTE = [
  { userId: "adrian", name: "Adrian", role: "SUBGERENTE" as const },
  { userId: "jazmin", name: "Jazmin", role: "ASESOR" as const },
  { userId: "waira", name: "Waira", role: "ASESOR" as const }
];

test("⚠️ un dia con porcentaje para quien ya no labora se PODA, no revienta", () => {
  // Es el bloqueo del 29 de agosto de 2026: se guardo la cuota, el equipo pidio
  // dias, se movieron los horarios, y la pantalla dejo de abrir.
  const poda = podarPorcentajesCaducados(
    { "2026-08-31": { adrian: 10, jazmin: 90 } },
    GENTE,
    { "2026-08-31": ["adrian", "waira"] }
  );
  assert.deepEqual(poda.percentages, {}, "el dia tenia que quedar fuera");
  assert.equal(poda.avisos.length, 1);
  assert.ok(poda.avisos[0].includes("Jazmin"), poda.avisos[0]);
  assert.ok(poda.avisos[0].includes("2026-08-31"));
});

test("se poda el DIA ENTERO, no solo a quien sobra", () => {
  // Quitarle solo su parte dejaria el dia sin sumar 100, y repartir su hueco
  // seria inventar un reparto que nadie eligio.
  const poda = podarPorcentajesCaducados(
    { "2026-08-31": { adrian: 10, jazmin: 90 } },
    GENTE,
    { "2026-08-31": ["adrian"] }
  );
  assert.equal(poda.percentages["2026-08-31"], undefined);
});

test("los dias que siguen cuadrando se conservan intactos", () => {
  const dia = { adrian: 10, jazmin: 50, waira: 40 };
  const poda = podarPorcentajesCaducados(
    { "2026-08-30": dia, "2026-08-31": { adrian: 10, jazmin: 90 } },
    GENTE,
    { "2026-08-30": ["adrian", "jazmin", "waira"], "2026-08-31": ["adrian"] }
  );
  assert.deepEqual(poda.percentages, { "2026-08-30": dia });
  assert.equal(poda.avisos.length, 1);
});

test("un cero para quien no labora no estorba", () => {
  // Solo molesta si de verdad le toca algo.
  const poda = podarPorcentajesCaducados(
    { "2026-08-31": { adrian: 100, jazmin: 0 } },
    GENTE,
    { "2026-08-31": ["adrian"] }
  );
  assert.deepEqual(poda.percentages, { "2026-08-31": { adrian: 100, jazmin: 0 } });
  assert.deepEqual(poda.avisos, []);
});

test("sin porcentajes guardados no hay nada que podar", () => {
  assert.deepEqual(podarPorcentajesCaducados(undefined, GENTE, {}), { percentages: {}, avisos: [] });
});

test("⚠️ al GUARDAR se sigue rechazando", () => {
  // La asimetria es deliberada: leer un borrador viejo se cura, escribir algo
  // imposible se rechaza.
  assert.throws(
    () => calculateFairQuota({
      dates: ["2026-08-31"],
      people: GENTE,
      minimums: { "2026-08-31": 1000 },
      presence: { "2026-08-31": ["adrian"] },
      percentages: { "2026-08-31": { adrian: 10, jazmin: 90 } }
    }),
    /no labora/
  );
});
