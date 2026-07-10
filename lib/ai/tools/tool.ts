import type { ZodType } from "zod";
import type { CopilotPhase } from "@/lib/ai/config";
import type { CopilotContext, ToolResult } from "@/lib/ai/types";
import type { Role } from "@/lib/types";

// Contrato de una herramienta de backend del Copilot.
//
// Reglas de seguridad incorporadas por diseño:
// - Los ARGUMENTOS del modelo NUNCA incluyen storeId ni identidad: el handler
//   recibe `ctx` con el storeId/userId/role validados desde la sesión.
// - `mutates` marca herramientas que escriben (prohibidas en Fase 1).
// - `phase` es la fase mínima en la que la herramienta queda expuesta.
export type CopilotTool<Args = unknown> = {
  name: string;
  description: string;
  phase: CopilotPhase;
  roles: Role[] | "all";
  mutates: boolean;
  // JSON Schema de parámetros que se envía al proveedor (tool-calling).
  parameters: Record<string, unknown>;
  // Validación estricta de los argumentos entregados por el modelo.
  argsSchema: ZodType<Args>;
  execute: (ctx: CopilotContext, args: Args) => Promise<ToolResult>;
};

export function defineTool<Args>(tool: CopilotTool<Args>): CopilotTool<Args> {
  return tool;
}

// Azúcar para resultados de herramienta.
export function toolOk(data: unknown): ToolResult {
  return { ok: true, data };
}

export function toolError(error: string): ToolResult {
  return { ok: false, error };
}

// ¿Puede este rol usar esta herramienta?
export function toolAllowsRole(tool: CopilotTool, role: Role, platformAdmin: boolean): boolean {
  if (platformAdmin) return true;
  return tool.roles === "all" || tool.roles.includes(role);
}
