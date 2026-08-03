import assert from "node:assert/strict";
import test from "node:test";
import {
  GUESS_BRACKETS,
  GUESS_ROLES,
  isGuessStore,
  schemeToRules,
  validateCapturedScheme,
  type CapturedScheme
} from "../lib/guess-scheme";
import { accruedCommission } from "../lib/commission";
import type { CommissionRule } from "../lib/types";

/** Tabulador completo y válido, con los importes de la etiqueta E. */
function esquemaValido(): CapturedScheme {
  const fijos: Record<string, [number, number][]> = {
    GERENTE:    [[4865, 12433], [6325, 16163], [7784, 19893], [9730, 24867]],
    SUBGERENTE: [[3284, 9060],  [4269, 11778], [5254, 14496], [6567, 18120]],
    ASESOR:     [[1655, 4462],  [2152, 5800],  [2649, 7138],  [3311, 8923]]
  };
  const porcentajes: Record<string, [number, number]> = {
    GERENTE: [1.654, 1.982], SUBGERENTE: [1.23, 1.473], ASESOR: [2.025, 2.427]
  };
  return {
    tier: "E",
    rows: GUESS_ROLES.map(({ role }) => ({
      role,
      brackets: GUESS_BRACKETS.map((b, i) => b.kind === "FIXED"
        ? { minAchievement: b.minAchievement, regular: fijos[role]![i]![0], high: fijos[role]![i]![1] }
        : { minAchievement: b.minAchievement, regular: porcentajes[role]![i - 4]!, high: null })
    }))
  };
}

test("isGuessStore reconoce la marca por el principio del nombre", () => {
  assert.equal(isGuessStore("GUESS SAN AGUSTIN"), true);
  assert.equal(isGuessStore("Guess Valle Oriente"), true);
  assert.equal(isGuessStore("  guess  plaza "), true);
  assert.equal(isGuessStore("GUESS"), true);
  // Con acento: se normaliza antes de comparar.
  assert.equal(isGuessStore("GUÉSS Centro"), true);
});

test("isGuessStore NO se deja engañar por nombres parecidos", () => {
  // "guess" pegado a otra palabra no es la marca.
  assert.equal(isGuessStore("Guessing Games"), false);
  // Tiene que estar al PRINCIPIO, no en cualquier parte.
  assert.equal(isGuessStore("ZARA GUESS"), false);
  assert.equal(isGuessStore(""), false);
  assert.equal(isGuessStore(null), false);
  assert.equal(isGuessStore(undefined), false);
});

test("un tabulador completo no tiene observaciones", () => {
  assert.deepEqual(validateCapturedScheme(esquemaValido()), []);
});

test("se rechaza si falta un puesto entero", () => {
  const scheme = esquemaValido();
  scheme.rows = scheme.rows.filter((r) => r.role !== "SUBGERENTE");
  const issues = validateCapturedScheme(scheme);
  assert.equal(issues.length, 1);
  assert.match(issues[0]!.message, /Subgerente/);
});

test("se rechaza si falta el importe de temporada alta", () => {
  const scheme = esquemaValido();
  scheme.rows[0]!.brackets[0]!.high = null;
  const issues = validateCapturedScheme(scheme);
  assert.equal(issues.length, 1);
  assert.match(issues[0]!.message, /temporada alta/);
});

test("se rechaza un porcentaje imposible", () => {
  const scheme = esquemaValido();
  // El escalón 5 es de porcentaje: 200 % sería un dedazo.
  scheme.rows[0]!.brackets[4]!.regular = 200;
  const issues = validateCapturedScheme(scheme);
  assert.equal(issues.length, 1);
  assert.match(issues[0]!.message, /no es v/);
});

test("se rechazan los negativos", () => {
  const scheme = esquemaValido();
  scheme.rows[2]!.brackets[1]!.regular = -100;
  assert.equal(validateCapturedScheme(scheme).length, 1);
});

test("el cero SÍ se admite: puede haber un escalón sin pago", () => {
  const scheme = esquemaValido();
  scheme.rows[1]!.brackets[0]!.regular = 0;
  scheme.rows[1]!.brackets[0]!.high = 0;
  assert.deepEqual(validateCapturedScheme(scheme), []);
});

test("schemeToRules genera 18 reglas con el tipo de pago correcto", () => {
  const rules = schemeToRules(esquemaValido(), "tienda-guess");
  assert.equal(rules.length, GUESS_ROLES.length * GUESS_BRACKETS.length);
  assert.equal(rules.filter((r) => r.payoutType === "FIXED").length, 12);
  assert.equal(rules.filter((r) => r.payoutType === "PERCENT").length, 6);
  // Un escalón fijo no lleva porcentaje, y uno de porcentaje no lleva importe.
  const fijo = rules.find((r) => r.role === "ASESOR" && r.minAchievement === 90)!;
  assert.equal(fijo.fixedAmount, 2649);
  assert.equal(fijo.fixedAmountHigh, 7138);
  assert.equal(fijo.commissionPercent, 0);
  const pct = rules.find((r) => r.role === "ASESOR" && r.minAchievement === 115)!;
  assert.equal(pct.commissionPercent, 2.427);
  assert.equal(pct.fixedAmount, null);
});

test("lo capturado se paga igual que el tabulador de las láminas", () => {
  // Cierra el círculo: de lo que teclea la gerencia al importe que se paga.
  const rules = schemeToRules(esquemaValido(), "tienda-guess").map((r, i) => ({
    ...r, id: `r${i}`, minSales: 0, maxSales: null
  })) as unknown as CommissionRule[];

  // 92 % del mínimo → escalón 90–94.99 → importe fijo de vendedor.
  const regular = accruedCommission({ sales: 92_000, goal: 115_000, minimum: 100_000, rules, role: "ASESOR" });
  assert.equal(regular.amount, 2649);
  const alta = accruedCommission({ sales: 92_000, goal: 115_000, minimum: 100_000, rules, role: "ASESOR", highSeason: true });
  assert.equal(alta.amount, 7138);

  // 120 % → escalón +115 % → 2.427 % de la venta, en cualquier temporada.
  const arriba = accruedCommission({ sales: 120_000, goal: 115_000, minimum: 100_000, rules, role: "ASESOR" });
  assert.equal(arriba.amount, 2912.4);

  // 70 % → no hay escalón por debajo del 80 %: no se paga nada.
  const abajo = accruedCommission({ sales: 70_000, goal: 115_000, minimum: 100_000, rules, role: "ASESOR" });
  assert.equal(abajo.amount, 0);
});
