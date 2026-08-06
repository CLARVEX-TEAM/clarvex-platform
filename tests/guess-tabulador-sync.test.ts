import assert from "node:assert/strict";
import test from "node:test";
import type { GuessTabulador } from "../lib/guess-rdv";
import { GUESS_BRACKETS, GUESS_ROLES } from "../lib/guess-scheme";
import { rulesDiffer, tabuladorToRules, type CommissionRuleSnapshot } from "../lib/guess-tabulador-sync";

/**
 * Los importes son los reales de la zona D (los mismos que valida
 * `guess-rdv.test.ts`): el fallo que esto elimina es capturar a mano la tabla de
 * OTRA zona, cifras plausibles que no se ven mal por ningun lado hasta que se
 * paga de mas.
 */
const FIJOS = [6637, 8628, 10619, 13273];
const PORCENTAJES = [1.611, 1.929];

function tabuladorCompleto(overrides: Partial<GuessTabulador> = {}): GuessTabulador {
  return {
    tier: "D",
    season: "LS (Ene-Oct)",
    lowSeason: true,
    rows: GUESS_ROLES.map(({ role }) => ({
      role,
      brackets: GUESS_BRACKETS.map((bracket, index) => ({
        minAchievement: bracket.minAchievement,
        maxAchievement: bracket.maxAchievement,
        kind: bracket.kind,
        value: bracket.kind === "FIXED" ? FIJOS[index]! : PORCENTAJES[index - 4]!
      }))
    })),
    ...overrides
  };
}

test("convierte el tabulador completo en las 18 reglas", () => {
  const rows = tabuladorToRules(tabuladorCompleto(), "store-1", []);
  assert.ok(rows);
  assert.equal(rows.length, GUESS_ROLES.length * GUESS_BRACKETS.length);
  assert.ok(rows.every((row) => row.active && row.storeId === "store-1"));
});

test("los escalones de importe fijo no llevan porcentaje, y al reves", () => {
  const rows = tabuladorToRules(tabuladorCompleto(), "store-1", [])!;
  for (const row of rows) {
    if (row.payoutType === "FIXED") {
      assert.equal(row.commissionPercent, 0);
      assert.equal(row.fixedAmount, FIJOS[GUESS_BRACKETS.findIndex((b) => b.minAchievement === row.minAchievement)]);
    } else {
      assert.equal(row.fixedAmount, null);
      assert.ok(row.commissionPercent > 0);
    }
  }
});

test("un tabulador incompleto NO pisa el esquema que ya hay", () => {
  // Media tabla es peor que ninguna: dejaria a la tienda pagando con escalones
  // sueltos sin que nada fallara.
  const aMedias = tabuladorCompleto();
  aMedias.rows[0]!.brackets.splice(2, 1);
  assert.equal(tabuladorToRules(aMedias, "store-1", []), null);

  const sinUnPuesto = tabuladorCompleto();
  sinUnPuesto.rows.pop();
  assert.equal(tabuladorToRules(sinUnPuesto, "store-1", []), null);
});

test("conserva la temporada que el archivo NO trae", () => {
  // El RDV declara una sola temporada. Escribir null en la otra borraria lo que
  // la gerencia capturo a mano, que es justo lo que el archivo no repone.
  const capturado: CommissionRuleSnapshot[] = [
    { role: "GERENTE", minAchievement: 80, payoutType: "FIXED", commissionPercent: 0, fixedAmount: 1, fixedAmountHigh: 9999 }
  ];
  const rows = tabuladorToRules(tabuladorCompleto(), "store-1", capturado)!;
  const gerente80 = rows.find((row) => row.role === "GERENTE" && row.minAchievement === 80)!;
  assert.equal(gerente80.fixedAmount, 6637, "el archivo manda en la temporada que declara");
  assert.equal(gerente80.fixedAmountHigh, 9999, "la otra temporada se hereda");
});

test("con un RDV de temporada alta se invierte cual manda", () => {
  const capturado: CommissionRuleSnapshot[] = [
    { role: "GERENTE", minAchievement: 80, payoutType: "FIXED", commissionPercent: 0, fixedAmount: 5555, fixedAmountHigh: 1 }
  ];
  const alta = tabuladorCompleto({ lowSeason: false, season: "HS (Nov-Dic)" });
  const gerente80 = tabuladorToRules(alta, "store-1", capturado)!
    .find((row) => row.role === "GERENTE" && row.minAchievement === 80)!;
  assert.equal(gerente80.fixedAmountHigh, 6637);
  assert.equal(gerente80.fixedAmount, 5555);
});

test("no reescribe cuando ya coincide", () => {
  // Corre cada hora: sin esto, cada pasada desactivaria 18 reglas y creceria la
  // tabla sin parar.
  const rows = tabuladorToRules(tabuladorCompleto(), "store-1", [])!;
  const iguales: CommissionRuleSnapshot[] = rows.map((row) => ({
    role: row.role,
    minAchievement: row.minAchievement,
    payoutType: row.payoutType,
    commissionPercent: row.commissionPercent,
    fixedAmount: row.fixedAmount,
    fixedAmountHigh: row.fixedAmountHigh
  }));
  assert.equal(rulesDiffer(rows, iguales), false);
});

test("detecta que hay que reescribir por numero, por tipo y por milesimas", () => {
  const rows = tabuladorToRules(tabuladorCompleto(), "store-1", [])!;
  const base: CommissionRuleSnapshot[] = rows.map((row) => ({
    role: row.role,
    minAchievement: row.minAchievement,
    payoutType: row.payoutType,
    commissionPercent: row.commissionPercent,
    fixedAmount: row.fixedAmount,
    fixedAmountHigh: row.fixedAmountHigh
  }));

  // El caso real de GUESS Galerias: nueve reglas del esquema viejo donde el de
  // GUESS tiene dieciocho.
  assert.equal(rulesDiffer(rows, base.slice(0, 9)), true);

  const otroTipo = base.map((rule, index) => (index === 0 ? { ...rule, payoutType: "PERCENT" as const } : rule));
  assert.equal(rulesDiffer(rows, otroTipo), true);

  // 1.611 contra 1.61: con un umbral de 0.001 la coma flotante lo dejaba pasar.
  const porUnaMilesima = base.map((rule) => (
    rule.payoutType === "PERCENT" && rule.minAchievement === 100 ? { ...rule, commissionPercent: 1.61 } : rule
  ));
  assert.equal(rulesDiffer(rows, porUnaMilesima), true);
});
