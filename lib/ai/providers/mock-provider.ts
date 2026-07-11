import type { LLMProvider } from "@/lib/ai/providers/provider";
import type { ChatMessage, ProviderChatParams, ProviderChatResult, ProviderToolCall } from "@/lib/ai/types";

// Proveedor determinista para tests y desarrollo sin API key. Simula el ciclo
// de tool-calling real: ante una pregunta con herramientas disponibles pide UNA
// herramienta relevante por keyword; cuando ya recibió el resultado, redacta
// una respuesta final usando esos datos reales (provenientes de la BD).
export class MockProvider implements LLMProvider {
  readonly name = "mock";

  isConfigured(): boolean {
    return true;
  }

  async chatComplete(params: ProviderChatParams): Promise<ProviderChatResult> {
    const lastRelevant = [...params.messages].reverse().find((m) => m.role === "user" || m.role === "tool");
    const usage = estimateUsage(params.messages);

    // Ya hay un resultado de herramienta ⇒ redactar respuesta final.
    if (lastRelevant?.role === "tool") {
      return this.result(mockAnswerFromTool(lastRelevant.name, lastRelevant.content), [], usage);
    }

    const query = lastRelevant?.role === "user" ? lastRelevant.content.toLowerCase() : "";
    const toolNames = new Set((params.tools ?? []).map((t) => t.name));
    const chosen = pickTool(query, toolNames);

    if (chosen) {
      const call: ProviderToolCall = { id: `mock_${chosen.name}`, name: chosen.name, arguments: JSON.stringify(chosen.args) };
      return this.result(null, [call], usage);
    }

    // Sin herramienta aplicable: respuesta directa (mock).
    return this.result("No tengo herramientas para responder eso con datos de tu tienda en este momento.", [], usage);
  }

  private result(content: string | null, toolCalls: ProviderToolCall[], usage: ProviderChatResult["usage"]): ProviderChatResult {
    return { content, toolCalls, usage, model: "mock-model", provider: this.name, finishReason: toolCalls.length ? "tool_calls" : "stop" };
  }
}

function pickTool(query: string, available: Set<string>): { name: string; args: Record<string, unknown> } | null {
  const candidates: Array<{ match: RegExp; name: string; args: Record<string, unknown> }> = [
    { match: /(comunicado|publicar|anunciar|cup[oó]n|descuento)/, name: "proposeCreateAnnouncement", args: { title: "Comunicado del equipo", body: "Detalle del comunicado para el equipo." } },
    { match: /(comision|comisión|bracket|recibo)/, name: "getCommissions", args: { period: "month" } },
    { match: /(pendiente|tarea|pend\b)/, name: "getOpenPendings", args: {} },
    { match: /(horario|turno|schedule)/, name: "getSchedules", args: {} },
    { match: /(compar|tendencia|\bvs\b|semana pasada|mes pasado)/, name: "comparePeriods", args: { period: "week" } },
    { match: /(asesor|colaborador|equipo|ranking|desempeñ|rendimiento|\ben\s+\w+)/, name: "getAdvisorPerformance", args: { period: "week" } },
    { match: /.*/, name: "getStoreDailyResults", args: {} }
  ];
  for (const candidate of candidates) {
    if (!candidate.match.test(query) || !available.has(candidate.name)) continue;
    // Si menciona un nombre tras "en X" / "de X", pásalo como advisor.
    const nameMatch = query.match(/\b(?:en|de|para)\s+([a-záéíóúñü]{3,})/i);
    if (nameMatch && (candidate.name === "getCommissions" || candidate.name === "getAdvisorPerformance" || candidate.name === "getSchedules")) {
      return { name: candidate.name, args: { ...candidate.args, advisor: nameMatch[1] } };
    }
    return { name: candidate.name, args: candidate.args };
  }
  // Fallback: primera herramienta disponible.
  const first = Array.from(available)[0];
  return first ? { name: first, args: {} } : null;
}

function mockAnswerFromTool(name: string, content: string): string {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return "No pude interpretar los datos de la herramienta.";
  }

  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    return `No fue posible obtener los datos: ${(data as { error: string }).error}`;
  }

  const record = (data ?? {}) as Record<string, unknown>;

  if (name === "getStoreDailyResults" || name === "getAdvisorPerformance") {
    const sales = num(record.sales ?? record.dailySales);
    const goal = num(record.goal ?? record.dailyGoal);
    const achievement = goal > 0 ? Math.round((sales / goal) * 100) : num(record.achievement);
    return `Hoy la venta es de $${sales.toLocaleString("es-MX")} sobre una meta de $${goal.toLocaleString("es-MX")} (${achievement}% de alcance).`;
  }
  if (name === "getOpenPendings") {
    const list = Array.isArray(record.pendings) ? record.pendings : Array.isArray(data) ? (data as unknown[]) : [];
    const top = list[0] as { title?: string; priority?: string } | undefined;
    return list.length
      ? `Tienes ${list.length} pendiente(s) abiertos. El más prioritario es "${top?.title ?? "sin título"}" (${top?.priority ?? "s/d"}).`
      : "No tienes pendientes abiertos.";
  }
  if (name === "getSchedules") {
    const list = Array.isArray(record.schedules) ? record.schedules : [];
    return `Encontré ${list.length} registros de horario para la semana consultada.`;
  }
  if (name === "comparePeriods") {
    const delta = num(record.salesDeltaPct);
    return `La venta cambió ${delta > 0 ? "+" : ""}${delta}% respecto al periodo anterior.`;
  }
  if (name === "getCommissions") {
    const own = (record.own ?? record.advisor) as { commissionAmount?: number; commissionPercent?: number; name?: string } | undefined;
    const amount = num(own?.commissionAmount);
    const percent = num(own?.commissionPercent);
    const team = Array.isArray(record.team) ? record.team : [];
    if (team.length > 0) {
      return `Comisión de tienda: $${amount.toLocaleString("es-MX")} (${percent}%). Hay ${team.length} asesor(es) con datos de comisión en el periodo.`;
    }
    return `Tu comisión estimada es $${amount.toLocaleString("es-MX")} al ${percent}%.`;
  }
  if (name === "proposeCreateAnnouncement") {
    return "Dejé el comunicado listo para confirmar. Pulsa «Confirmar y publicar» para enviarlo al equipo.";
  }
  return `Datos obtenidos correctamente de la herramienta ${name}.`;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function estimateUsage(messages: ChatMessage[]) {
  const chars = messages.reduce((total, m) => total + ("content" in m && typeof m.content === "string" ? m.content.length : 0), 0);
  const promptTokens = Math.ceil(chars / 4);
  const completionTokens = 24;
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
}
