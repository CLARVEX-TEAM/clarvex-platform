import { AI_CONFIG } from "@/lib/ai/config";
import { buildCopilotContext } from "@/lib/ai/context";
import { synthesizeFallbackAnswer } from "@/lib/ai/fallback-answers";
import { clampAnswer, assertReadOnlyForPhase } from "@/lib/ai/guardrails";
import { modelForTier, selectModelTier } from "@/lib/ai/models";
import { createProviderRouter } from "@/lib/ai/providers/provider-router";
import { buildSystemPrompt } from "@/lib/ai/prompts/system";
import { recordAiUsage } from "@/lib/ai/telemetry";
import { executeTool, selectTools, toolSchemas } from "@/lib/ai/tools/registry";
import type { ChatMessage, CopilotTurn, PendingAction, TokenUsage } from "@/lib/ai/types";
import type { Session } from "@/lib/session-token";

export type CopilotInput = {
  query?: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
};

const EMPTY_USAGE: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function addUsage(a: TokenUsage, b: TokenUsage | null): TokenUsage {
  if (!b) return a;
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens
  };
}

function isPendingAction(data: unknown): data is { proposalId: string; type: string; summary: string } {
  return (
    typeof data === "object" && data !== null &&
    (data as Record<string, unknown>).requiresConfirmation === true &&
    typeof (data as Record<string, unknown>).proposalId === "string"
  );
}

function buildHistory(input: CopilotInput): ChatMessage[] {
  if (input.messages && input.messages.length > 0) {
    return input.messages.map((message) => ({ role: message.role, content: message.content }));
  }
  return [{ role: "user", content: input.query ?? "" }];
}

// Orquestador central del Copilot. Ejecuta el pipeline:
// 1-4) identidad (sesión → contexto: usuario, rol, tienda) — vía requireSession
//      + buildCopilotContext; 5) modelo; 6) herramientas; 7) ciclo de
//      tool-calling; 8) telemetría; 9) fallback (dentro del ProviderRouter).
export async function runCopilot(session: Session, input: CopilotInput): Promise<CopilotTurn> {
  const startedAt = Date.now();
  const ctx = buildCopilotContext(session);

  const history = buildHistory(input);
  const latestUserMessage = [...history].reverse().find((message) => message.role === "user")?.content ?? "";
  const tier = selectModelTier(latestUserMessage);
  const model = modelForTier(tier);

  const tools = selectTools(ctx);
  assertReadOnlyForPhase(tools);
  const schemas = toolSchemas(tools);

  const conversation: ChatMessage[] = [{ role: "system", content: buildSystemPrompt(ctx, AI_CONFIG.phase) }, ...history];
  const router = createProviderRouter();

  let usage = EMPTY_USAGE;
  const toolInvocations: CopilotTurn["toolInvocations"] = [];
  const pendingActions: PendingAction[] = [];
  let provider = "unknown";
  let answer: string | null = null;
  let iterations = 0;

  try {
    for (let step = 0; step < AI_CONFIG.maxToolIterations; step++) {
      iterations = step + 1;
      const offerTools = schemas.length > 0;
      const result = await router.chatComplete({
        model,
        messages: conversation,
        tools: offerTools ? schemas : undefined,
        temperature: AI_CONFIG.temperature,
        maxTokens: AI_CONFIG.maxOutputTokens
      });
      usage = addUsage(usage, result.usage);
      provider = result.provider;

      if (result.toolCalls.length > 0 && step < AI_CONFIG.maxToolIterations - 1) {
        conversation.push({ role: "assistant", content: result.content, toolCalls: result.toolCalls });
        for (const call of result.toolCalls) {
          const outcome = await executeTool(ctx, tools, call.name, call.arguments);
          toolInvocations.push({ name: call.name, ok: outcome.ok });
          // Fase 3: una herramienta "propose..." devuelve una acción pendiente
          // de confirmación (no ejecutada). Se recoge para que la UI la confirme.
          if (outcome.ok && isPendingAction(outcome.data)) {
            pendingActions.push({ proposalId: outcome.data.proposalId, type: outcome.data.type, summary: outcome.data.summary });
          }
          conversation.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify(outcome.ok ? outcome.data : { error: outcome.error })
          });
        }
        continue;
      }

      answer = result.content;
      break;
    }

    // El modelo agotó las iteraciones pidiendo herramientas: forzamos una
    // respuesta final sin herramientas para no dejar al usuario sin contestación.
    if (answer === null) {
      const closing = await router.chatComplete({
        model,
        messages: [...conversation, { role: "user", content: "Con la información ya obtenida, responde de forma concreta y breve." }],
        temperature: AI_CONFIG.temperature,
        maxTokens: AI_CONFIG.maxOutputTokens
      });
      usage = addUsage(usage, closing.usage);
      provider = closing.provider;
      answer = closing.content;
    }

    const finalAnswer = clampAnswer(answer?.trim() || "No encontré información suficiente para responder.");

    await recordAiUsage({
      storeId: ctx.storeId,
      userId: ctx.userId,
      feature: "copilot",
      provider,
      model,
      modelTier: tier,
      usage,
      toolCalls: toolInvocations.length,
      iterations,
      latencyMs: Date.now() - startedAt,
      status: "success"
    });

    return { answer: finalAnswer, usage, toolInvocations, pendingActions, model, modelTier: tier, provider, iterations };
  } catch (error) {
    const toolMessages = conversation
      .filter((message): message is Extract<ChatMessage, { role: "tool" }> => message.role === "tool")
      .map((message) => ({ name: message.name, content: message.content }));
    const fallbackAnswer = synthesizeFallbackAnswer(toolMessages);

    if (fallbackAnswer) {
      const finalAnswer = clampAnswer(fallbackAnswer);
      await recordAiUsage({
        storeId: ctx.storeId,
        userId: ctx.userId,
        feature: "copilot",
        provider: "kpi-fallback",
        model,
        modelTier: tier,
        usage,
        toolCalls: toolInvocations.length,
        iterations,
        latencyMs: Date.now() - startedAt,
        status: "success",
        errorMessage: error instanceof Error ? error.message.slice(0, 200) : null
      });
      return { answer: finalAnswer, usage, toolInvocations, pendingActions, model, modelTier: tier, provider: "kpi-fallback", iterations };
    }

    await recordAiUsage({
      storeId: ctx.storeId,
      userId: ctx.userId,
      feature: "copilot",
      provider,
      model,
      modelTier: tier,
      usage,
      toolCalls: toolInvocations.length,
      iterations,
      latencyMs: Date.now() - startedAt,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
