import type { ModelTier, TokenUsage } from "@/lib/ai/types";
import { prisma } from "@/lib/prisma";

// Registro de consumo de IA (append-only). NUNCA lanza: si la escritura falla,
// la respuesta del Copilot no debe romperse por la telemetría.
export type AiUsageInput = {
  storeId: string;
  userId: string | null;
  feature: string;
  provider: string;
  model: string;
  modelTier: ModelTier;
  usage: TokenUsage;
  toolCalls: number;
  iterations: number;
  latencyMs: number;
  status: "success" | "error";
  errorMessage?: string | null;
};

export async function recordAiUsage(input: AiUsageInput): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: {
        storeId: input.storeId,
        userId: input.userId,
        feature: input.feature,
        provider: input.provider,
        model: input.model,
        modelTier: input.modelTier,
        promptTokens: input.usage.promptTokens,
        completionTokens: input.usage.completionTokens,
        totalTokens: input.usage.totalTokens,
        toolCalls: input.toolCalls,
        iterations: input.iterations,
        latencyMs: input.latencyMs,
        status: input.status,
        errorMessage: input.errorMessage ? input.errorMessage.slice(0, 500) : null
      }
    });
  } catch (cause) {
    console.error("recordAiUsage:", cause);
  }
}
