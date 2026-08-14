export type ManagerDashboardMetricInput = {
  sales: number;
  goal: number;
  transactions: number;
  pieces: number;
  traffic: number | null;
};

export type ManagerDashboardMetric = ManagerDashboardMetricInput & {
  achievement: number | null;
  remaining: number;
  upt: number | null;
  aur: number | null;
  ept: number | null;
  conversion: number | null;
};

function ratio(numerator: number, denominator: number, decimals = 2): number | null {
  if (denominator <= 0) return null;
  const factor = 10 ** decimals;
  return Math.round((numerator / denominator) * factor) / factor;
}

/**
 * Cálculos del Inicio gerencial de Retool.
 *
 * Recibe únicamente sumandos crudos. Mantenerlo puro permite probar que Retool
 * y Clarvex muestran exactamente las mismas fórmulas sin depender de Prisma.
 */
export function buildManagerDashboardMetric(input: ManagerDashboardMetricInput): ManagerDashboardMetric {
  const traffic = input.traffic !== null && input.traffic >= 0 ? input.traffic : null;

  return {
    ...input,
    traffic,
    achievement: input.goal > 0 ? ratio(input.sales * 100, input.goal) : null,
    remaining: Math.max(0, input.goal - input.sales),
    upt: ratio(input.pieces, input.transactions),
    aur: ratio(input.sales, input.pieces),
    ept: ratio(input.sales, input.transactions),
    conversion: traffic !== null && traffic > 0 ? ratio(input.transactions * 100, traffic) : null
  };
}

