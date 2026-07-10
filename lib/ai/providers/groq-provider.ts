import { AI_CONFIG } from "@/lib/ai/config";
import { openAiCompatibleChat } from "@/lib/ai/providers/openai-compatible";
import type { LLMProvider } from "@/lib/ai/providers/provider";
import type { ProviderChatParams, ProviderChatResult } from "@/lib/ai/types";

// Adaptador a Groq (API compatible con OpenAI). Modelos por defecto:
// openai/gpt-oss-20b (rápido) y openai/gpt-oss-120b (avanzado).
export class GroqProvider implements LLMProvider {
  readonly name = "groq";

  isConfigured(): boolean {
    return AI_CONFIG.groq.apiKey.length > 0;
  }

  chatComplete(params: ProviderChatParams): Promise<ProviderChatResult> {
    return openAiCompatibleChat({
      providerName: this.name,
      baseUrl: AI_CONFIG.groq.baseUrl,
      apiKey: AI_CONFIG.groq.apiKey,
      params,
      timeoutMs: AI_CONFIG.requestTimeoutMs
    });
  }
}
