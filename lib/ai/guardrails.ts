import { AI_CONFIG } from "@/lib/ai/config";
import type { CopilotTool } from "@/lib/ai/tools/tool";

// Salvaguardas de fase: en Fase 1 (solo lectura) ninguna herramienta expuesta
// puede ser mutante. Defensa en profundidad además del filtrado del registro.
export function assertReadOnlyForPhase(tools: CopilotTool[], phase = AI_CONFIG.phase): void {
  if (phase >= 3) return;
  const mutating = tools.find((tool) => tool.mutates);
  if (mutating) {
    throw new Error(`Herramienta mutante "${mutating.name}" expuesta en fase ${phase} (solo lectura).`);
  }
}

// Recorta la respuesta final a un tamaño razonable para el chat.
export function clampAnswer(answer: string): string {
  const max = 4_000;
  return answer.length > max ? `${answer.slice(0, max)}…` : answer;
}
