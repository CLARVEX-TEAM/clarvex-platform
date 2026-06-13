// Lógica pura para los mensajes de notificaciones automáticas (sin acceso a BD).
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

// ---------------------------------------------------------------------------
// Cierre del día (EVENING)
// ---------------------------------------------------------------------------

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

/** Construye el mensaje de cierre del asesor según su caso A-F. */
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
      body = `🏆 ¡Increíble ${name}! Hoy superaste tu meta con ${venta}. Tu alcance fue ${achievement}% — ¡estás en el nivel más alto de comisión! Así se hace. 🔥`;
      break;
    case "B":
      body = `🎉 ¡Felicidades ${name}! Hoy cubriste tu meta con ${venta}. Tu alcance fue ${achievement}%. ¡Excelente trabajo!`;
      break;
    case "C":
      body = `💪 ¡Buen día ${name}! Hoy vendiste ${venta} y alcanzaste el ${achievement}% de tu meta. Te faltaron ${diferencia} para llegar. ¡Mañana lo logras!`;
      break;
    case "D":
      body = `👋 Hola ${name}, hoy vendiste ${venta} con un alcance de ${achievement}%. No te desanimes, cada día es una nueva oportunidad. Te faltaron ${diferencia}. ¡Éxito! 💙`;
      break;
    case "E":
      body = `💙 Hola ${name}, sabemos que hoy fue un día difícil. Vendiste ${venta} con un alcance de ${achievement}%. No te rindas — los grandes vendedores se forjan en los días difíciles. ¡Mañana es tu día! 💪`;
      break;
    case "F":
    default:
      body = `📋 Hola ${name}, hoy no se registraron ventas a tu nombre. Si trabajaste hoy, verifica con tu gerente que tus ventas estén capturadas. ¡Mañana con todo! 💙`;
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

// ---------------------------------------------------------------------------
// Arranque del día (MORNING)
// ---------------------------------------------------------------------------

/** Selecciona el mensaje motivacional matutino según día y alcance semanal. */
export function selectMorningMotivation(opts: {
  name: string;
  weekday: number; // 0=domingo ... 6=sábado
  weeklyGoal: number;
  remaining: number;
  achievementPct: number;
}): string {
  if (opts.weekday === 1) {
    return `🚀 ¡Feliz lunes ${opts.name}! Semana nueva, oportunidad nueva. Tu meta esta semana es ${formatMxn(opts.weeklyGoal)}. ¡Comencemos con todo!`;
  }
  if (opts.weekday === 5) {
    return `⚡ ¡Es viernes ${opts.name}! Último día para cerrar fuerte. Te faltan ${formatMxn(Math.max(opts.remaining, 0))} — hoy puedes lograrlo. ¡Dale con todo!`;
  }
  if (opts.achievementPct >= 80) {
    return `🔥 ¡Vas excelente! Estás muy cerca de tu meta semanal. Hoy es tu oportunidad de cerrar con todo. ¡Tú puedes!`;
  }
  if (opts.achievementPct >= 50) {
    return `💪 Vas bien, pero hoy hay que acelerar. Enfócate en cada cliente y haz que cada venta cuente. ¡Éxito!`;
  }
  return `🎯 Hoy es un día clave para remontar. Recuerda: una buena mañana puede cambiar toda la semana. ¡Sal a conquistar tus metas!`;
}

export type MorningAdvisorInput = {
  name: string;
  dailyGoal: number;
  weeklySales: number;
  weeklyGoal: number;
  weekday: number;
};

/** Construye el mensaje matutino del asesor. */
export function buildMorningAdvisorMessage(input: MorningAdvisorInput): { title: string; body: string } {
  const name = firstName(input.name);
  const remaining = input.weeklyGoal - input.weeklySales;
  const achievementPct = input.weeklyGoal > 0 ? (input.weeklySales / input.weeklyGoal) * 100 : 0;
  const faltanteLine = remaining <= 0
    ? "¡Ya cumpliste tu meta semanal! 🎉"
    : `Te faltan ${formatMxn(remaining)} para cumplir tu meta semanal.`;
  const motivation = selectMorningMotivation({ name, weekday: input.weekday, weeklyGoal: input.weeklyGoal, remaining, achievementPct });
  const body =
    `☀️ ¡Buenos días ${name}!\n\n` +
    `Tu meta de hoy es ${formatMxn(input.dailyGoal)}.\n` +
    `Llevas acumulado esta semana ${formatMxn(input.weeklySales)}.\n` +
    `${faltanteLine}\n\n` +
    `${motivation}`;
  return { title: "Buenos días ☀️", body };
}

export type MorningManagerInput = {
  dateLabel: string;
  storeDailyGoal: number;
  storeWeeklySales: number;
  storeWeeklyGoal: number;
  activeAdvisors: number;
};

/** Construye el resumen matutino para gerente/subgerente. */
export function buildMorningManagerSummary(input: MorningManagerInput): { title: string; body: string } {
  const achievement = input.storeWeeklyGoal > 0 ? Math.round((input.storeWeeklySales / input.storeWeeklyGoal) * 100) : 0;
  const remaining = Math.max(input.storeWeeklyGoal - input.storeWeeklySales, 0);
  const body =
    `☀️ Buenos días — Arranque del día ${input.dateLabel}\n` +
    `Meta de tienda hoy: ${formatMxn(input.storeDailyGoal)}\n` +
    `Venta acumulada esta semana: ${formatMxn(input.storeWeeklySales)}\n` +
    `Alcance semanal: ${achievement}%\n` +
    `Faltante para meta semanal: ${formatMxn(remaining)}\n` +
    `Equipo activo hoy: ${input.activeAdvisors} asesores`;
  return { title: "Arranque del día", body };
}
