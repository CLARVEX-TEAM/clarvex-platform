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

// ---------------------------------------------------------------------------
// Celebración instantánea al alcanzar la meta (GOAL_REACHED)
// ---------------------------------------------------------------------------

/** Felicitación inmediata cuando un asesor cruza el 100% de su meta del día. */
export function buildGoalReachedMessage(input: { name: string; sales: number; goal: number }): { title: string; body: string } {
  const name = firstName(input.name);
  const pct = input.goal > 0 ? Math.round((input.sales / input.goal) * 100) : 0;
  const body = `🎉 ¡FELICIDADES ${name}! Acabas de alcanzar tu meta del día con ${formatMxn(input.sales)} (${pct}%). ¡Eres una máquina de ventas! Sigue sumando. 🔥`;
  return { title: "🎉 ¡Meta alcanzada!", body };
}

// ---------------------------------------------------------------------------
// Alerta de media jornada (MIDDAY)
// ---------------------------------------------------------------------------

/** Empujón para un asesor que va atrasado a media jornada. */
export function buildMiddayAdvisorMessage(input: { name: string; sales: number; goal: number }): { title: string; body: string } {
  const name = firstName(input.name);
  const pct = input.goal > 0 ? Math.round((input.sales / input.goal) * 100) : 0;
  const remaining = formatMxn(Math.max(input.goal - input.sales, 0));
  const body = `⏰ ¡Vamos ${name}! A media jornada llevas ${formatMxn(input.sales)} (${pct}% de tu meta de hoy). Te faltan ${remaining} — aún hay tiempo de sobra. Enfócate en cada cliente y cierra fuerte. 💪`;
  return { title: "Media jornada ⏰", body };
}

/** Resumen de media jornada para gerencia: quién va atrasado. */
export function buildMiddayManagerSummary(input: {
  dateLabel: string;
  storeSales: number;
  storeGoal: number;
  thresholdPct: number;
  behind: Array<{ name: string; sales: number; goal: number }>;
}): { title: string; body: string } {
  const pct = input.storeGoal > 0 ? Math.round((input.storeSales / input.storeGoal) * 100) : 0;
  const lines = [
    `⏰ Media jornada — ${input.dateLabel}`,
    `Venta de tienda: ${formatMxn(input.storeSales)} (${pct}% de la meta del día)`,
    ``
  ];
  if (input.behind.length === 0) {
    lines.push(`✅ Todo el equipo va en ritmo (≥ ${input.thresholdPct}%).`);
  } else {
    lines.push(`⚠️ Asesores atrasados (< ${input.thresholdPct}%):`);
    for (const advisor of input.behind) {
      const advisorPct = advisor.goal > 0 ? Math.round((advisor.sales / advisor.goal) * 100) : 0;
      lines.push(`• ${firstName(advisor.name)}: ${formatMxn(advisor.sales)} (${advisorPct}%)`);
    }
  }
  return { title: "Media jornada", body: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// Bajo desempeño sostenido (LOW_PERF) — alerta a gerencia
// ---------------------------------------------------------------------------

/** Resumen para gerencia con los asesores bajo meta de forma sostenida. */
export function buildLowPerformanceManagerSummary(input: {
  windowDays: number;
  thresholdPct: number;
  flagged: Array<{ name: string; daysBelow: number; avgPct: number }>;
}): { title: string; body: string } {
  const lines = [
    `🚨 Bajo desempeño sostenido — últimos ${input.windowDays} días`,
    ``,
    `Por debajo del ${input.thresholdPct}% de su meta diaria en todos sus días laborados:`
  ];
  for (const advisor of input.flagged) {
    lines.push(`• ${firstName(advisor.name)}: ${advisor.avgPct}% promedio (${advisor.daysBelow} días)`);
  }
  lines.push(``, `Considera dar seguimiento o coaching al equipo.`);
  return { title: "Bajo desempeño sostenido", body: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// Cierre de semana (WEEKLY)
// ---------------------------------------------------------------------------

/** Línea de comparativo vs la semana anterior. Null si no hay base de comparación. */
export function weeklyComparisonLine(sales: number, prevSales: number): string | null {
  if (prevSales <= 0) return null;
  const deltaPct = Math.round(((sales - prevSales) / prevSales) * 100);
  if (deltaPct > 0) return `📈 +${deltaPct}% vs la semana pasada. ¡Vas en ascenso!`;
  if (deltaPct < 0) return `📉 ${deltaPct}% vs la semana pasada. ¡A recuperar el ritmo!`;
  return `➡️ Mismo nivel que la semana pasada.`;
}

export type WeeklyAdvisorInput = {
  name: string;
  sales: number;
  goal: number;
  rank: number;
  prevSales: number;
};

/** Construye el mensaje de cierre de semana del asesor. El #1 recibe felicitación de líder. */
export function buildWeeklyAdvisorMessage(input: WeeklyAdvisorInput): { title: string; body: string } {
  const name = firstName(input.name);
  const achievement = input.goal > 0 ? Math.round((input.sales / input.goal) * 100) : 0;
  const comparison = weeklyComparisonLine(input.sales, input.prevSales);

  // Líder de la semana: #1 con venta real.
  if (input.rank === 1 && input.sales > 0) {
    const body = [
      `🏆 ¡Eres el LÍDER de la semana, ${name}! 👑`,
      ``,
      `Cerraste con ${formatMxn(input.sales)} (${achievement}% de tu meta) y quedaste #1 del equipo.`,
      ...(comparison ? [comparison] : []),
      ``,
      `El equipo te sigue. ¡Sostén la corona la próxima semana!`
    ].join("\n");
    return { title: "🏆 Líder de la semana", body };
  }

  const motivation = achievement >= 100
    ? "🏆 ¡Cumpliste tu meta semanal! Excelente trabajo."
    : achievement >= 80
      ? "💪 Muy cerca. La próxima la cierras."
      : "🚀 Nueva semana, nueva oportunidad para brillar.";
  const body = [
    `🏁 Cierre de semana, ${name}`,
    ``,
    `Vendiste ${formatMxn(input.sales)} de tu meta ${formatMxn(input.goal)} (${achievement}%).`,
    `Quedaste en el lugar #${input.rank} del equipo.`,
    ...(comparison ? [comparison] : []),
    ``,
    motivation
  ].join("\n");
  return { title: "Cierre de semana 🏁", body };
}

export type WeeklyManagerInput = {
  rangeLabel: string;
  storeSales: number;
  storeGoal: number;
  prevStoreSales: number;
  top: Array<{ name: string; sales: number }>;
};

/** Construye el resumen semanal para gerente/subgerente con Top del equipo. */
export function buildWeeklyManagerSummary(input: WeeklyManagerInput): { title: string; body: string } {
  const achievement = input.storeGoal > 0 ? Math.round((input.storeSales / input.storeGoal) * 100) : 0;
  const comparison = weeklyComparisonLine(input.storeSales, input.prevStoreSales);
  const leader = input.top[0];
  const topLines = input.top.map((member, index) => `${index + 1}. ${firstName(member.name)} — ${formatMxn(member.sales)}`);
  const body = [
    `📊 Resumen semanal — ${input.rangeLabel}`,
    `Venta de tienda: ${formatMxn(input.storeSales)} de ${formatMxn(input.storeGoal)} (${achievement}%)`,
    ...(comparison ? [comparison] : []),
    ...(leader ? [``, `🏆 Líder de la semana: ${firstName(leader.name)} — ${formatMxn(leader.sales)}`] : []),
    ``,
    `Top del equipo:`,
    ...(topLines.length ? topLines : ["Sin ventas registradas esta semana."])
  ].join("\n");
  return { title: "Resumen semanal", body };
}
