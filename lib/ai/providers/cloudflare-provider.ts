import { AI_CONFIG } from "@/lib/ai/config";
import { openAiCompatibleChat } from "@/lib/ai/providers/openai-compatible";
import type { LLMProvider } from "@/lib/ai/providers/provider";
import type { ProviderChatParams, ProviderChatResult } from "@/lib/ai/types";

// Respaldo (futuro): Cloudflare Workers AI expone un endpoint compatible con
// OpenAI en https://api.cloudflare.com/client/v4/accounts/{id}/ai/v1
// Se deja implementado tras la misma abstracción; se activa cuando haya
// credenciales. Mientras `isConfigured()` sea false, el router lo ignora.
export class CloudflareProvider implements LLMProvider {
  readonly name = "cloudflare";

  private baseUrl(): string {
    if (AI_CONFIG.cloudflare.baseUrl) return AI_CONFIG.cloudflare.baseUrl;
    if (AI_CONFIG.cloudflare.accountId) {
      return `https://api.cloudflare.com/client/v4/accounts/${AI_CONFIG.cloudflare.accountId}/ai/v1`;
    }
    return "";
  }

  isConfigured(): boolean {
    return AI_CONFIG.cloudflare.apiToken.length > 0 && this.baseUrl().length > 0;
  }

  chatComplete(params: ProviderChatParams): Promise<ProviderChatResult> {
    return openAiCompatibleChat({
      providerName: this.name,
      baseUrl: this.baseUrl(),
      apiKey: AI_CONFIG.cloudflare.apiToken,
      params,
      timeoutMs: AI_CONFIG.requestTimeoutMs
    });
  }
}
