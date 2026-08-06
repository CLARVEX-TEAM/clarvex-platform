import type { GuessTabulador } from "@/lib/guess-rdv";
import { GUESS_BRACKETS, GUESS_ROLES } from "@/lib/guess-scheme";
import type { Role } from "@/lib/types";

/**
 * El tabulador de comisiones sale del propio RDV.
 *
 * Antes lo tecleaba la gerencia: 30 importes, y distintos por zona —el escalón
 * de 80 % vale $6,637 en la D y $4,865 en la E—. Copiarse de la tabla
 * equivocada daba un esquema entero plausible y falso que nadie detectaba hasta
 * que alguien reclamaba su pago. El RDV de cada tienda trae el suyo, así que
 * equivocarse de zona deja de ser posible.
 *
 * Importa el tipo de `guess-rdv` con `import type`: así no arrastra el lector de
 * hojas de cálculo a quien solo necesita construir reglas.
 */

/** Una regla activa de la tienda, en números planos. */
export type CommissionRuleSnapshot = {
  role: Role | null;
  minAchievement: number;
  payoutType: "FIXED" | "PERCENT";
  commissionPercent: number;
  fixedAmount: number | null;
  fixedAmountHigh: number | null;
};

/** Fila lista para `createMany` en CommissionRule. */
export type GuessRuleRow = {
  storeId: string;
  role: Role;
  minAchievement: number;
  maxAchievement: number | null;
  payoutType: "FIXED" | "PERCENT";
  commissionPercent: number;
  fixedAmount: number | null;
  fixedAmountHigh: number | null;
  active: boolean;
};

// Media unidad de la escala en que se guarda cada cosa: centavos en importes,
// milésimas en porcentajes (1.611 %, 2.427 %…).
//
// La mitad y no la unidad entera: con el umbral justo en 0.001, la diferencia
// entre 1.611 y 1.61 se calcula como 0.0009999999999998899 en coma flotante y
// se colaría por debajo — justo la escala que este tabulador usa de verdad.
const MONEY_EPSILON = 0.005;
const PERCENT_EPSILON = 0.0005;

function sameNumber(left: number | null, right: number | null, epsilon: number): boolean {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) < epsilon;
}

/**
 * Convierte el tabulador del archivo en reglas para la tienda.
 *
 * Devuelve `null` si el tabulador NO viene completo (los tres puestos con sus
 * seis escalones). Un archivo a medio leer no puede pisar un esquema bueno:
 * más vale quedarse con el que hay que escribir medio tabulador.
 *
 * **La temporada que el archivo no declara se CONSERVA.** El RDV trae los
 * importes de una sola (`LS (Ene-Oct)` en los de agosto de 2026); si se
 * escribiera `null` en la otra se borraría lo que la gerencia hubiera capturado
 * a mano, que es justo lo que el archivo no puede reponer.
 */
export function tabuladorToRules(
  tabulador: GuessTabulador,
  storeId: string,
  existing: CommissionRuleSnapshot[]
): GuessRuleRow[] | null {
  const previous = new Map<string, CommissionRuleSnapshot>();
  for (const rule of existing) {
    if (rule.role) previous.set(`${rule.role}:${rule.minAchievement}`, rule);
  }

  const rows: GuessRuleRow[] = [];

  for (const { role } of GUESS_ROLES) {
    const fileRow = tabulador.rows.find((item) => item.role === role);
    if (!fileRow) return null;

    for (const bracket of GUESS_BRACKETS) {
      const fromFile = fileRow.brackets.find((item) => item.minAchievement === bracket.minAchievement);
      // Falta un escalón, o el archivo lo trae como porcentaje donde toca
      // importe fijo: el tabulador no es el que esperamos y no se aplica nada.
      if (!fromFile || fromFile.kind !== bracket.kind) return null;

      const kept = previous.get(`${role}:${bracket.minAchievement}`);
      const isFixed = bracket.kind === "FIXED";
      // El archivo manda sobre la temporada que declara; la otra se hereda.
      const regular = isFixed ? (tabulador.lowSeason ? fromFile.value : kept?.fixedAmount ?? null) : null;
      const high = isFixed ? (tabulador.lowSeason ? kept?.fixedAmountHigh ?? null : fromFile.value) : null;

      rows.push({
        storeId,
        role,
        minAchievement: bracket.minAchievement,
        maxAchievement: bracket.maxAchievement,
        payoutType: bracket.kind,
        commissionPercent: isFixed ? 0 : fromFile.value,
        fixedAmount: regular,
        fixedAmountHigh: high,
        active: true
      });
    }
  }

  return rows;
}

/**
 * ¿Hace falta reescribir?
 *
 * La sincronización corre cada hora. Sin esta comparación, cada pasada
 * desactivaría 18 reglas y crearía otras 18 idénticas: la tabla crecería sin
 * parar y el historial de cambios dejaría de significar nada.
 */
export function rulesDiffer(next: GuessRuleRow[], existing: CommissionRuleSnapshot[]): boolean {
  const current = existing.filter((rule) => rule.role !== null);
  if (current.length !== next.length) return true;

  return next.some((row) => {
    const match = current.find((rule) => rule.role === row.role && Math.abs(rule.minAchievement - row.minAchievement) < 0.01);
    if (!match) return true;
    if (match.payoutType !== row.payoutType) return true;
    if (!sameNumber(match.commissionPercent, row.commissionPercent, PERCENT_EPSILON)) return true;
    if (!sameNumber(match.fixedAmount, row.fixedAmount, MONEY_EPSILON)) return true;
    return !sameNumber(match.fixedAmountHigh, row.fixedAmountHigh, MONEY_EPSILON);
  });
}
