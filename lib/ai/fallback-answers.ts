import { money } from "@/lib/format";

type ToolPayload = Record<string, unknown>;

function asRecord(value: unknown): ToolPayload | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as ToolPayload) : null;
}

function formatStorePerformance(data: ToolPayload): string | null {
  const perf = asRecord(data.performance);
  if (!perf) return null;
  const periodLabel = typeof data.periodLabel === "string" ? data.periodLabel : "el periodo";
  const sales = Number(perf.sales);
  const goal = Number(perf.goal);
  const achievement = Number(perf.achievement);
  const remaining = Number(perf.remainingToGoal);
  if (!Number.isFinite(sales) || !Number.isFinite(goal)) return null;
  if (Number.isFinite(remaining) && remaining > 0) {
    return `Según la pestaña KPIs (${periodLabel}): faltan ${money(remaining)} para el 100% de la meta (${achievement}% de alcance: ${money(sales)} de ${money(goal)}).`;
  }
  return `Meta cumplida en ${periodLabel}: ${money(sales)} sobre meta de ${money(goal)} (${achievement}% de alcance).`;
}

function formatDailyResults(data: ToolPayload): string | null {
  const sales = Number(data.sales);
  const goal = Number(data.goal);
  const achievement = Number(data.achievement);
  const scope = data.scope === "store" ? "la tienda" : "tus números";
  if (!Number.isFinite(sales) || !Number.isFinite(goal)) return null;
  const date = typeof data.date === "string" ? data.date : "hoy";
  return `Resultados del día (${date}) para ${scope}: venta ${money(sales)} sobre meta ${money(goal)} (${achievement}% de alcance).`;
}

function formatOpenPendings(data: ToolPayload): string | null {
  const count = Number(data.count);
  const pendings = Array.isArray(data.pendings) ? data.pendings : [];
  if (!Number.isFinite(count)) return null;
  if (count === 0) return "No tienes pendientes abiertos en este momento.";
  const top = pendings.slice(0, 3).map((item) => {
    const row = asRecord(item);
    return row?.title ?? "sin título";
  });
  return `Tienes ${count} pendiente(s) abierto(s). Prioritarios: ${top.join(", ")}.`;
}

function formatComparePeriods(data: ToolPayload): string | null {
  const current = asRecord(data.current);
  const previous = asRecord(data.previous);
  const delta = Number(data.salesDeltaPct);
  if (!current || !previous) return null;
  const curLabel = typeof current.periodLabel === "string" ? current.periodLabel : "periodo actual";
  const prevLabel = typeof previous.periodLabel === "string" ? previous.periodLabel : "periodo anterior";
  const deltaText = Number.isFinite(delta) ? `${delta > 0 ? "+" : ""}${delta}%` : "sin variación calculable";
  return `Comparación retail: ${curLabel} ${money(Number(current.sales))} vs ${prevLabel} ${money(Number(previous.sales))}. Variación de venta: ${deltaText}.`;
}

function formatAdvisorPerformance(data: ToolPayload): string | null {
  const advisor = asRecord(data.advisor);
  const team = Array.isArray(data.team) ? data.team : null;
  const periodLabel = typeof data.periodLabel === "string" ? data.periodLabel : "el periodo";
  if (advisor) {
    return `${String(advisor.name)} en ${periodLabel}: venta ${money(Number(advisor.sales))}, meta ${money(Number(advisor.goal))}, alcance ${advisor.achievement}%.`;
  }
  if (team && team.length > 0) {
    const lines = team.slice(0, 5).map((item, index) => {
      const row = asRecord(item);
      if (!row) return "";
      return `${index + 1}. ${row.name} — ${money(Number(row.sales))} (${row.achievement}%)`;
    }).filter(Boolean);
    return `Ranking del equipo (${periodLabel}):\n${lines.join("\n")}`;
  }
  return null;
}

function formatCommissions(data: ToolPayload): string | null {
  const own = asRecord(data.own);
  const advisor = asRecord(data.advisor);
  const person = advisor ?? own;
  if (!person) return null;
  const amount = Number(person.commissionAmount);
  const percent = Number(person.commissionPercent);
  if (!Number.isFinite(amount)) return null;
  return `Comisión estimada de ${String(person.name)}: ${money(amount)} al ${percent}% (misma lógica que pestaña KPIs → Comisión).`;
}

const FORMATTERS: Record<string, (data: ToolPayload) => string | null> = {
  getStorePerformance: formatStorePerformance,
  getStoreDailyResults: formatDailyResults,
  getOpenPendings: formatOpenPendings,
  comparePeriods: formatComparePeriods,
  getAdvisorPerformance: formatAdvisorPerformance,
  getCommissions: formatCommissions
};

/** Respuesta determinística cuando el LLM falla pero ya hay datos de herramientas KPI. */
export function synthesizeFallbackAnswer(toolMessages: Array<{ name: string; content: string }>): string | null {
  for (let index = toolMessages.length - 1; index >= 0; index -= 1) {
    const message = toolMessages[index];
    const formatter = FORMATTERS[message.name];
    if (!formatter) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message.content);
    } catch {
      continue;
    }
    const record = asRecord(parsed);
    if (!record || typeof record.error === "string") continue;
    const answer = formatter(record);
    if (answer) return answer;
  }
  return null;
}
