import assert from "node:assert/strict";
import test from "node:test";
import type { GuessTabulador } from "../lib/guess-rdv";
import { compareGuessTabulador, type CommissionRuleSnapshot } from "../lib/guess-tabulador-check";

/**
 * Los importes son los reales de la zona D (los mismos que valida
 * `guess-rdv.test.ts`), porque el fallo que esto vigila es justamente que
 * alguien capture la tabla de OTRA zona: son cifras plausibles y el error no se
 * ve por ningun lado hasta que se paga.
 */
const TABULADOR: GuessTabulador = {
  tier: "D",
  season: "LS (Ene-Oct)",
  lowSeason: true,
  rows: [
    {
      role: "GERENTE",
      brackets: [
        { minAchievement: 80, maxAchievement: 84.99, kind: "FIXED", value: 6637 },
        { minAchievement: 100, maxAchievement: 114.99, kind: "PERCENT", value: 1.611 }
      ]
    }
  ]
};

const REGLA_CORRECTA: CommissionRuleSnapshot[] = [
  { role: "GERENTE", minAchievement: 80, commissionPercent: 0, fixedAmount: 6637, fixedAmountHigh: 9000 },
  { role: "GERENTE", minAchievement: 100, commissionPercent: 1.611, fixedAmount: null, fixedAmountHigh: null }
];

test("no dice nada cuando lo capturado coincide con el RDV", () => {
  assert.deepEqual(compareGuessTabulador(TABULADOR, REGLA_CORRECTA), []);
});

test("calla si la tienda todavia no ha capturado el esquema", () => {
  // Saldrian las 18 diferencias de golpe y taparian cualquier aviso real; de
  // eso ya se encarga la pantalla de captura.
  assert.deepEqual(compareGuessTabulador(TABULADOR, []), []);
});

test("detecta un importe de OTRA zona", () => {
  const zonaEquivocada: CommissionRuleSnapshot[] = [
    { ...REGLA_CORRECTA[0]!, fixedAmount: 4865 },
    REGLA_CORRECTA[1]!
  ];
  const issues = compareGuessTabulador(TABULADOR, zonaEquivocada);
  assert.equal(issues.length, 1);
  assert.match(issues[0]!, /Gerente/);
  assert.match(issues[0]!, /zona D/);
  assert.match(issues[0]!, /temporada regular/);
});

test("detecta un porcentaje mal capturado hasta en la tercera decimal", () => {
  // El tabulador de Guess usa tres decimales; con dos, 1.611 y 1.61 pasarian
  // por iguales y la comision saldria mal sin que nada fallara.
  const porUnaMilesima: CommissionRuleSnapshot[] = [
    REGLA_CORRECTA[0]!,
    { ...REGLA_CORRECTA[1]!, commissionPercent: 1.61 }
  ];
  assert.equal(compareGuessTabulador(TABULADOR, porUnaMilesima).length, 1);
});

test("compara contra la temporada que el archivo declara, no contra la otra", () => {
  // El RDV trae UNA sola temporada. Con lowSeason el importe de temporada alta
  // no tiene con que contrastarse, asi que no se inventa una diferencia.
  const altaDistinta: CommissionRuleSnapshot[] = [
    { ...REGLA_CORRECTA[0]!, fixedAmountHigh: 99999 },
    REGLA_CORRECTA[1]!
  ];
  assert.deepEqual(compareGuessTabulador(TABULADOR, altaDistinta), []);

  const enTemporadaAlta: GuessTabulador = { ...TABULADOR, lowSeason: false, season: "HS (Nov-Dic)" };
  const issues = compareGuessTabulador(enTemporadaAlta, altaDistinta);
  assert.equal(issues.length, 1);
  assert.match(issues[0]!, /temporada alta/);
});

test("un escalon que el RDV no trae no se inventa", () => {
  const conEscalonExtra: CommissionRuleSnapshot[] = [
    ...REGLA_CORRECTA,
    { role: "GERENTE", minAchievement: 115, commissionPercent: 1.929, fixedAmount: null, fixedAmountHigh: null }
  ];
  assert.deepEqual(compareGuessTabulador(TABULADOR, conEscalonExtra), []);
});
