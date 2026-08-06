import type { GuessTabulador } from "@/lib/guess-rdv";
import { GUESS_BRACKETS, GUESS_ROLES } from "@/lib/guess-scheme";
import type { Role } from "@/lib/types";

/**
 * Contrasta el tabulador que el RDV trae dentro contra el que capturó la tienda.
 *
 * El esquema de comisiones lo teclea la gerencia (30 importes), y los importes
 * CAMBIAN POR ZONA: el escalón de 80 % vale $6,637 en la zona D y $4,865 en la
 * E. Copiarse de la tabla equivocada da un esquema entero plausible pero falso,
 * y como el resultado son pagos de nómina, nadie lo nota hasta que alguien
 * reclama.
 *
 * Aquí NO se corrige nada: el RDV manda como referencia, pero quien decide sigue
 * siendo la gerencia. Solo se señalan las diferencias para que se revisen.
 *
 * Importa el tipo de `guess-rdv` con `import type` a propósito: así no arrastra
 * el lector de hojas de cálculo a quien solo necesita comparar.
 */

/** Una regla activa de la tienda, ya convertida a números planos. */
export type CommissionRuleSnapshot = {
  role: Role | null;
  minAchievement: number;
  commissionPercent: number;
  fixedAmount: number | null;
  fixedAmountHigh: number | null;
};

// MEDIA unidad de la escala en que se guarda cada cosa: centavos en los
// importes, milésimas en los porcentajes (1.611 %, 2.427 %…).
//
// La mitad y no la unidad entera: con el umbral justo en 0.001, la diferencia
// entre 1.611 y 1.61 se calcula como 0.0009999999999998899 en coma flotante y
// se colaría por debajo — justo la escala que este tabulador usa de verdad.
const MONEY_EPSILON = 0.005;
const PERCENT_EPSILON = 0.0005;

function money(value: number): string {
  return value.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}

function percent(value: number): string {
  return `${value.toLocaleString("es-MX", { maximumFractionDigits: 3 })} %`;
}

/**
 * Devuelve una línea por diferencia encontrada. Vacío si todo cuadra.
 *
 * Dos silencios deliberados:
 *
 * - **Si la tienda aún no ha capturado nada** no se dice nada. Saldrían las 18
 *   diferencias de golpe y taparían cualquier aviso real; además, de eso ya se
 *   encarga la pantalla de captura, que insiste en cada ingreso.
 * - **Solo se compara la temporada que el archivo declara.** El RDV trae los
 *   importes de UNA temporada (`LS (Ene-Oct)` en los de agosto de 2026), así
 *   que la otra no se toca: no hay con qué contrastarla, y avisar de una
 *   diferencia inexistente entrena a ignorar los avisos.
 */
export function compareGuessTabulador(tabulador: GuessTabulador, rules: CommissionRuleSnapshot[]): string[] {
  const captured = rules.filter((rule) => rule.role !== null);
  if (captured.length === 0) return [];

  const zone = tabulador.tier ? ` (zona ${tabulador.tier})` : "";
  const seasonLabel = tabulador.lowSeason ? "temporada regular" : "temporada alta";
  const issues: string[] = [];

  for (const { role, label: roleLabel } of GUESS_ROLES) {
    const fileRow = tabulador.rows.find((row) => row.role === role);
    if (!fileRow) continue;

    for (const bracket of GUESS_BRACKETS) {
      const fromFile = fileRow.brackets.find((item) => item.minAchievement === bracket.minAchievement);
      const stored = captured.find((rule) => rule.role === role && Math.abs(rule.minAchievement - bracket.minAchievement) < 0.01);
      if (!fromFile || !stored) continue;

      if (fromFile.kind === "PERCENT") {
        if (Math.abs(stored.commissionPercent - fromFile.value) >= PERCENT_EPSILON) {
          issues.push(`Comisiones · ${roleLabel} · ${bracket.label}: el RDV${zone} dice ${percent(fromFile.value)} y la app tiene ${percent(stored.commissionPercent)}.`);
        }
        continue;
      }

      const amount = tabulador.lowSeason ? stored.fixedAmount : stored.fixedAmountHigh;
      if (amount === null) continue;
      if (Math.abs(amount - fromFile.value) >= MONEY_EPSILON) {
        issues.push(`Comisiones · ${roleLabel} · ${bracket.label} (${seasonLabel}): el RDV${zone} dice ${money(fromFile.value)} y la app tiene ${money(amount)}.`);
      }
    }
  }

  return issues;
}
