import type { CommissionPayoutType, CommissionRule, Role } from "@/lib/types";

/**
 * Importe que paga UN bracket para una venta dada.
 *
 * Es el único sitio donde se decide cuánto vale un bracket. Los cuatro
 * calculadores de este archivo (acumulada, siguiente bracket, simulador y
 * proyección de cierre) pasan por aquí, para que no haya dos fórmulas que
 * puedan separarse con el tiempo.
 *
 * - `PERCENT` (histórico, todas las marcas menos Guess): venta × tasa.
 * - `FIXED` (esquema Guess, agosto 2026): importe fijo del bracket, INDEPENDIENTE
 *   de la venta. Vender más dentro del mismo escalón no paga más; lo que paga es
 *   saltar de escalón.
 *
 * Una regla sin `payoutType` se trata como `PERCENT`: las filas que ya existían
 * antes de la migración dan exactamente el mismo importe que antes.
 */
export function rulePayout(
  rule: Pick<CommissionRule, "commissionPercent" | "payoutType" | "fixedAmount" | "fixedAmountHigh"> | null | undefined,
  sales: number,
  highSeason = false
): number {
  if (!rule) return 0;
  if (rule.payoutType === "FIXED") {
    const regular = rule.fixedAmount ?? 0;
    // En temporada alta se paga `fixedAmountHigh`; si esa columna viene vacía se
    // cae al importe regular en vez de a cero: un dato faltante no debe
    // convertirse en un pago de cero para alguien que sí cumplió.
    const amount = highSeason ? rule.fixedAmountHigh ?? regular : regular;
    return round2(amount);
  }
  return round2(sales * ((rule.commissionPercent ?? 0) / 100));
}

/** Tasa a mostrar de un bracket. Los brackets de importe fijo no tienen tasa. */
function rulePercent(rule: { commissionPercent?: number; payoutType?: CommissionPayoutType | null } | null | undefined): number {
  if (!rule || rule.payoutType === "FIXED") return 0;
  return rule.commissionPercent ?? 0;
}

export function findCommissionRule(rules: CommissionRule[], role: Role, achievement: number) {
  const rule = rules.find((item) => (
    item.active &&
    item.role === role &&
    achievement >= item.minAchievement &&
    (item.maxAchievement === null || item.maxAchievement === undefined || achievement <= item.maxAchievement)
  ));

  return rule;
}

// El mínimo de comisión equivale a meta ÷ 1.15 (al 100% de la meta el alcance vs
// mínimo da 115%). Se usa cuando el RDV no trae un mínimo sincronizado explícito.
export const MINIMUM_TO_GOAL_FACTOR = 1.15;

/** Mínimo de comisión: el sincronizado si existe (>0), si no se deriva de la meta. */
export function resolveCommissionMinimum(commissionMinimum: number | null | undefined, goal: number): number {
  if (commissionMinimum && commissionMinimum > 0) return commissionMinimum;
  return goal > 0 ? Math.round((goal / MINIMUM_TO_GOAL_FACTOR) * 100) / 100 : 0;
}

/**
 * ¿El periodo cae en temporada alta?
 *
 * Se compara por CLAVE DE FECHA (`YYYY-MM-DD`), no con objetos Date: comparar
 * fechas con hora arrastra la zona horaria y un rango que termina el día 31
 * dejaría fuera ese mismo 31 a partir de las 18:00 en Monterrey.
 *
 * Sin ningún rango que lo cubra devuelve `false` (temporada regular). Es el
 * valor conservador: paga el importe menor, así que un rango sin capturar se
 * detecta por defecto en vez de pagar de más.
 */
export function isHighSeason(
  seasons: Array<{ startDate: string | Date; endDate: string | Date }>,
  date: string | Date
): boolean {
  const key = dateKey(date);
  return seasons.some((season) => key >= dateKey(season.startDate) && key <= dateKey(season.endDate));
}

function dateKey(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export type AccruedCommission = {
  /** Comisión acumulada estimada. Venta × tasa, o el importe fijo del bracket. */
  amount: number;
  /** Tasa del bracket vigente, en %. Vale 0 si el bracket paga importe fijo. */
  percent: number;
  /** Alcance de comisión (venta ÷ mínimo), en %. */
  achievement: number;
  /** Mínimo usado (el sincronizado o el derivado de la meta). */
  minimum: number;
  /** Cómo paga el bracket alcanzado. Sin bracket, "PERCENT" con importe 0. */
  payoutType: CommissionPayoutType;
  /**
   * Importe fijo aplicado, si el bracket es de los que pagan fijo. La interfaz
   * lo necesita para no anunciar «0%» donde en realidad hay un bono.
   */
  fixedAmount: number;
};

/**
 * Comisión ACUMULADA que lleva alguien, a partir de su venta y meta ya cargadas.
 * Solo LEE el cálculo aprobado (resolveCommissionMinimum + findCommissionRule +
 * venta × %), la misma fórmula que el simulador. NO modifica la lógica de
 * comisión: sirve para mostrar "la comisión que llevo" sin depender de que el
 * RDV traiga commissionAmount poblado (a veces llega en 0).
 */
export function accruedCommission(input: { sales: number; goal: number; minimum?: number | null; rules: CommissionRule[]; role: Role; highSeason?: boolean }): AccruedCommission {
  const minimum = resolveCommissionMinimum(input.minimum, input.goal);
  const achievement = minimum > 0 ? (input.sales / minimum) * 100 : 0;
  const rule = findCommissionRule(input.rules, input.role, achievement);
  return {
    amount: rulePayout(rule, input.sales, input.highSeason),
    percent: rulePercent(rule),
    achievement,
    minimum,
    payoutType: rule?.payoutType === "FIXED" ? "FIXED" : "PERCENT",
    fixedAmount: rule?.payoutType === "FIXED" ? rulePayout(rule, input.sales, input.highSeason) : 0
  };
}

export type NextBracketGap = {
  atTop: boolean;
  currentPercent: number;
  nextPercent: number;
  targetAchievement: number;
  salesNeeded: number;
  extraCommission: number;
};

/**
 * Calcula cuánto falta vender para alcanzar el SIGUIENTE bracket de comisión.
 * El alcance se mide contra el mínimo (misma regla que el cálculo real).
 * No modifica el cálculo de comisión: solo lo lee para motivar la venta.
 */
export function computeNextBracketGap(input: { sales: number; minimum: number; rules: CommissionRule[]; role: Role; highSeason?: boolean }): NextBracketGap | null {
  if (input.minimum <= 0) return null;
  const achievement = (input.sales / input.minimum) * 100;
  const active = input.rules
    .filter((rule) => rule.active && rule.role === input.role)
    .sort((left, right) => left.minAchievement - right.minAchievement);
  if (active.length === 0) return null;
  const current = findCommissionRule(active, input.role, achievement);
  const currentPercent = rulePercent(current);
  const next = active.find((rule) => rule.minAchievement > achievement);
  if (!next) {
    return { atTop: true, currentPercent, nextPercent: currentPercent, targetAchievement: current?.minAchievement ?? 0, salesNeeded: 0, extraCommission: 0 };
  }
  const targetSales = input.minimum * (next.minAchievement / 100);
  const salesNeeded = round2(Math.max(0, targetSales - input.sales));
  // La diferencia se calcula con el importe REAL de cada bracket, no con la
  // resta de porcentajes: entre dos escalones de importe fijo no hay tasas que
  // restar, y con el esquema Guess la resta de porcentajes daría siempre cero.
  const extraCommission = round2(
    rulePayout(next, targetSales, input.highSeason) - rulePayout(current, input.sales, input.highSeason)
  );
  return { atTop: false, currentPercent, nextPercent: rulePercent(next), targetAchievement: next.minAchievement, salesNeeded, extraCommission };
}

function round2(value: number) { return Math.round(value * 100) / 100; }

export type CommissionSimulation = {
  /** Extremo inferior del deslizador: la venta ya hecha (no se puede simular menos). */
  sliderMin: number;
  /** Extremo superior: siempre alcanza el bracket más alto del rol. */
  sliderMax: number;
  /** Venta simulada, ya acotada al rango del deslizador. */
  simulatedSales: number;
  /** Comisión con la venta REAL del periodo. */
  real: AccruedCommission;
  /** Comisión con la venta simulada. */
  simulated: AccruedCommission;
  /** Cuánto falta vender para llegar a la venta simulada (0 si es la venta real). */
  salesToSimulated: number;
  /** Comisión extra que se llevaría al llegar a la venta simulada. */
  extraCommissionVsReal: number;
  /** Cuánto falta, desde la venta simulada, para el siguiente bracket. */
  gap: NextBracketGap | null;
};

/**
 * Estado completo del simulador de comisión de un PERIODO.
 *
 * Venta, meta y mínimo tienen que ser del MISMO periodo: el alcance es
 * venta ÷ mínimo, así que mezclar la venta de un día con el mínimo del mes da un
 * alcance falso y clava la tasa en el bracket más bajo.
 *
 * Solo compone el cálculo aprobado (resolveCommissionMinimum + findCommissionRule
 * + accruedCommission + computeNextBracketGap). No cambia ninguna fórmula.
 */
export function buildCommissionSimulation(input: {
  sales: number;
  goal: number;
  minimum?: number | null;
  rules: CommissionRule[];
  role: Role;
  /** Venta que mueve el usuario. Sin valor, el simulador arranca en la venta real. */
  simulatedSales?: number;
  /** Temporada alta del periodo simulado. Cambia el importe de los brackets fijos. */
  highSeason?: boolean;
}): CommissionSimulation {
  const minimum = resolveCommissionMinimum(input.minimum, input.goal);
  const sliderMin = Math.round(Math.max(0, input.sales));
  // El deslizador tiene que poder llegar al bracket más alto del rol. Si se queda
  // corto, moverlo de tope a tope nunca cambia la tasa y el simulador no simula.
  const topAchievement = input.rules
    .filter((rule) => rule.active && rule.role === input.role)
    .reduce((top, rule) => Math.max(top, rule.minAchievement), 0);
  const topSales = minimum > 0 && topAchievement > 0 ? minimum * (topAchievement / 100) : 0;
  const sliderMax = Math.max(sliderMin + 10_000, Math.round(input.goal * 1.5), Math.round(topSales * 1.1));
  const simulatedSales = Math.min(Math.max(input.simulatedSales ?? sliderMin, sliderMin), sliderMax);
  const scope = { goal: input.goal, minimum: input.minimum, rules: input.rules, role: input.role, highSeason: input.highSeason };
  const real = accruedCommission({ ...scope, sales: input.sales });
  const simulated = accruedCommission({ ...scope, sales: simulatedSales });
  return {
    sliderMin,
    sliderMax,
    simulatedSales,
    real,
    simulated,
    salesToSimulated: round2(Math.max(0, simulatedSales - input.sales)),
    extraCommissionVsReal: round2(Math.max(0, simulated.amount - real.amount)),
    gap: computeNextBracketGap({ sales: simulatedSales, minimum, rules: input.rules, role: input.role, highSeason: input.highSeason })
  };
}

export type MonthlyCommissionProjection = {
  projectedSales: number;
  projectedCommission: number;
  percent: number;
  achievement: number;
};

/**
 * Proyecta la comisión de cierre de mes a partir de las SEMANAS con datos.
 * Como las metas, el mínimo y los horarios se cargan semana por semana, se
 * proyecta la venta al ritmo de las semanas ya capturadas (cada semana ya
 * refleja solo los días laborados). El nivel de comisión se toma del
 * cumplimiento REAL actual (venta ÷ mínimo de las semanas cargadas), NO de la
 * venta proyectada contra un mínimo incompleto.
 * No modifica el cálculo de comisión: reutiliza findCommissionRule + venta × %.
 */
export function projectMonthlyCommission(input: {
  salesToDate: number;
  minimumToDate: number;
  weeksElapsed: number;
  totalWeeks: number;
  rules: CommissionRule[];
  role: Role;
  highSeason?: boolean;
}): MonthlyCommissionProjection | null {
  // El alcance de comisión se mide contra el mínimo: sin mínimo no hay proyección.
  if (input.salesToDate <= 0 || input.weeksElapsed < 1 || input.totalWeeks < 1 || input.minimumToDate <= 0) return null;
  const weeksElapsed = Math.min(input.totalWeeks, input.weeksElapsed);
  const projectedSales = (input.salesToDate / weeksElapsed) * input.totalWeeks;
  const achievement = input.minimumToDate > 0 ? (input.salesToDate / input.minimumToDate) * 100 : 0;
  const rule = findCommissionRule(input.rules, input.role, achievement);
  return {
    projectedSales,
    projectedCommission: rulePayout(rule, projectedSales, input.highSeason),
    percent: rulePercent(rule),
    achievement
  };
}
