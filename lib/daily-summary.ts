// Lógica pura para los mensajes de cierre de día (sin acceso a BD).
// No depende de KPIs/comisiones/parsers — solo formatea venta, meta y alcance.

export type DailySummaryCase = "A" | "B" | "C" | "D" | "E" | "F";

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0
});

/** Formatea un monto como pesos mexicanos sin decimales (ej: $12,345). */
export function formatMxn(value: number): string {
  return currencyFormatter.format(Math.round(value));
}

/** Devuelve solo el primer nombre (ej: "WAIRA ZITLALI POPOCA" -> "WAIRA"). */
export function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

/**
 * Selecciona el caso A-F según venta y alcance (en porcentaje, no fracción).
 * - venta = 0  -> F (sin ventas)
 * - > 115%     -> A
 * - 100%-115%  -> B
 * - 80%-99%    -> C
 * - 50%-79%    -> D
 * - < 50%      -> E
 */
export function resolveDailyCase(sales: number, achievementPct: number): DailySummaryCase {
  if (sales <= 0) return "F";
  if (achievementPct > 115) return "A";
  if (achievementPct >= 100) return "B";
  if (achievementPct >= 80) return "C";
  if (achievementPct >= 50) return "D";
  return "E";
}

export type AdvisorDailyInput = {
  name: string;
  sales: number;
  goal: number;
};

export type AdvisorDailyMessage = {
  case: DailySummaryCase;
  achievement: number;
  title: string;
  body: string;
};

/** Construye el mensaje personalizado del asesor según su caso A-F. */
export function buildAdvisorMessage(input: AdvisorDailyInput): AdvisorDailyMessage {
  const name = firstName(input.name);
  const { sales, goal } = input;
  const achievementRaw = goal > 0 ? (sales / goal) * 100 : sales > 0 ? 100 : 0;
  const achievement = Math.round(achievementRaw);
  const dailyCase = resolveDailyCase(sales, achievementRaw);
  const venta = formatMxn(sales);
  const diferencia = formatMxn(Math.max(goal - sales, 0));

  let body: string;
  switch (dailyCase) {
    case "A":
      body = `🏆 ¡Increíble ${name}! Hoy superaste tu meta con ${venta} en ventas.\nTu alcance fue ${achievement}% — ¡estás en el nivel más alto de comisión!\nAsí se hace, sigue así. 🔥`;
      break;
    case "B":
      body = `🎉 ¡Felicidades ${name}! Hoy cubriste tu meta con ${venta} en ventas.\nTu alcance del día fue ${achievement}%. ¡Excelente trabajo!`;
      break;
    case "C":
      body = `💪 ¡Buen día ${name}! Hoy vendiste ${venta} y alcanzaste el ${achievement}% de tu meta.\nTe faltaron ${diferencia} para llegar al 100%.\n¡Mañana lo logras, tú puedes!`;
      break;
    case "D":
      body = `👋 Hola ${name}, hoy vendiste ${venta} con un alcance de ${achievement}%.\nNo te desanimes, cada día es una nueva oportunidad.\nTe faltaron ${diferencia} — mañana ve por ellos. ¡Éxito! 💙`;
      break;
    case "E":
      body = `💙 Hola ${name}, sabemos que hoy fue un día difícil.\nVendiste ${venta} con un alcance de ${achievement}%.\nNo te rindas — los grandes vendedores se forjan en los días difíciles.\n¡Mañana es tu día! 💪`;
      break;
    case "F":
    default:
      body = `📋 Hola ${name}, hoy no se registraron ventas a tu nombre.\nSi trabajaste hoy, verifica con tu gerente que tus ventas estén capturadas.\n¡Mañana con todo! 💙`;
      break;
  }

  return { case: dailyCase, achievement, title: "Cierre del día", body };
}

export type ManagerSummaryInput = {
  dateLabel: string;
  storeSales: number;
  storeGoal: number;
  overGoal: number;
  near: number;
  below: number;
};

/** Construye el resumen de cierre para gerente/subgerente. */
export function buildManagerSummary(input: ManagerSummaryInput): { title: string; body: string } {
  const achievement = input.storeGoal > 0 ? Math.round((input.storeSales / input.storeGoal) * 100) : 0;
  const body =
    `📊 Resumen de cierre — ${input.dateLabel}\n` +
    `Venta del día: ${formatMxn(input.storeSales)}\n` +
    `Meta del día: ${formatMxn(input.storeGoal)}\n` +
    `Alcance: ${achievement}%\n\n` +
    `✅ Sobre meta: ${input.overGoal} asesores\n` +
    `⚠️ Cerca: ${input.near} asesores\n` +
    `❌ Abajo: ${input.below} asesores`;
  return { title: "Resumen de cierre", body };
}
