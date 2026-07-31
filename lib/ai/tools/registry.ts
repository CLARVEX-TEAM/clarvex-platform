import { AI_CONFIG } from "@/lib/ai/config";
import { proposeCreateAnnouncementTool } from "@/lib/ai/tools/action/propose-create-announcement";
import { prepareAnnouncementDraftTool } from "@/lib/ai/tools/draft/prepare-announcement-draft";
import { prepareDailyPlanDraftTool } from "@/lib/ai/tools/draft/prepare-daily-plan-draft";
import { preparePendingDraftTool } from "@/lib/ai/tools/draft/prepare-pending-draft";
import { comparePeriodsTool } from "@/lib/ai/tools/read/compare-periods";
import { getAdvisorPerformanceTool } from "@/lib/ai/tools/read/get-advisor-performance";
import { getCommissionsTool } from "@/lib/ai/tools/read/get-commissions";
import { getElectronicTicketsTool } from "@/lib/ai/tools/read/get-electronic-tickets";
import { getOpenPendingsTool } from "@/lib/ai/tools/read/get-open-pendings";
import { getSchedulesTool } from "@/lib/ai/tools/read/get-schedules";
import { getStoreDailyResultsTool } from "@/lib/ai/tools/read/get-store-daily-results";
import { getStorePerformanceTool } from "@/lib/ai/tools/read/get-store-performance";
import { toolAllowsRole, type CopilotTool } from "@/lib/ai/tools/tool";
import type { CopilotContext, ProviderToolSchema, ToolResult } from "@/lib/ai/types";

// Todas las herramientas registradas. Añadir una = importarla aquí.
const ALL_TOOLS: CopilotTool[] = [
  // Fase 1 — solo lectura.
  getStoreDailyResultsTool as CopilotTool,
  getStorePerformanceTool as CopilotTool,
  getAdvisorPerformanceTool as CopilotTool,
  getCommissionsTool as CopilotTool,
  getOpenPendingsTool as CopilotTool,
  getSchedulesTool as CopilotTool,
  comparePeriodsTool as CopilotTool,
  getElectronicTicketsTool as CopilotTool,
  // Fase 2 — preparación de borradores (no escriben; solo reúnen contexto).
  prepareAnnouncementDraftTool as CopilotTool,
  prepareDailyPlanDraftTool as CopilotTool,
  preparePendingDraftTool as CopilotTool,
  // Fase 3 — acciones con confirmación (proponen; no ejecutan hasta confirmar).
  proposeCreateAnnouncementTool as CopilotTool
];

// Herramientas disponibles para este contexto: filtra por fase operativa y por
// rol. En Fase 1 se excluye cualquier herramienta mutante (defensa en
// profundidad, aunque hoy ninguna lo sea).
export function selectTools(ctx: CopilotContext, phase = AI_CONFIG.phase): CopilotTool[] {
  return ALL_TOOLS.filter((tool) => {
    if (tool.phase > phase) return false;
    if (phase < 3 && tool.mutates) return false;
    return toolAllowsRole(tool, ctx.role, ctx.platformAdmin);
  });
}

export function toolSchemas(tools: CopilotTool[]): ProviderToolSchema[] {
  return tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
}

// Ejecuta una herramienta pedida por el modelo. Valida existencia + argumentos
// (Zod). Devuelve un ToolResult (no lanza) para que el modelo pueda recuperarse.
export async function executeTool(ctx: CopilotContext, tools: CopilotTool[], name: string, argsJson: string): Promise<ToolResult> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) return { ok: false, error: `Herramienta desconocida: ${name}.` };

  let rawArgs: unknown;
  try {
    rawArgs = argsJson && argsJson.trim() ? JSON.parse(argsJson) : {};
  } catch {
    return { ok: false, error: "Los argumentos de la herramienta no son JSON válido." };
  }

  const parsed = tool.argsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, error: `Argumentos inválidos: ${parsed.error.issues[0]?.message ?? "formato incorrecto"}.` };
  }

  try {
    return await tool.execute(ctx, parsed.data);
  } catch (cause) {
    console.error(`[ai] Error ejecutando herramienta ${name}:`, cause);
    return { ok: false, error: "La herramienta falló al obtener los datos." };
  }
}
