import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceAiRateLimit, isApiError, parseJson, requireSession } from "@/lib/api";
import { toUserFacingCopilotError } from "@/lib/ai/errors";
import { runCopilot } from "@/lib/ai/orchestrator";

export const dynamic = "force-dynamic";

// Contrato retrocompatible: acepta { query } (un turno) o { messages } (multi-
// turno). Devuelve { answer } como antes; añade metadatos no-sensibles.
const inputSchema = z
  .object({
    query: z.string().trim().min(1).max(2000).optional(),
    messages: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
      .min(1)
      .max(20)
      .optional()
  })
  .refine((value) => Boolean(value.query) || Boolean(value.messages), { message: "Consulta vacía o inválida." });

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const limited = await enforceAiRateLimit(session.userId);
  if (limited) return limited;

  const parsed = await parseJson(request, inputSchema);
  if ("response" in parsed) return parsed.response;

  try {
    const turn = await runCopilot(session, { query: parsed.data.query, messages: parsed.data.messages });
    return NextResponse.json(
      {
        answer: turn.answer,
        pendingActions: turn.pendingActions,
        meta: { model: turn.model, tier: turn.modelTier, tools: turn.toolInvocations.map((t) => t.name) }
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("[Copilot Route Error]:", error);
    const facing = toUserFacingCopilotError(error);
    return NextResponse.json(
      { error: facing.message, retryable: facing.retryable },
      { status: facing.status }
    );
  }
}
