import { AI_CONFIG } from "@/lib/ai/config";
import { NoProviderAvailableError, ProviderError } from "@/lib/ai/errors";
import { CloudflareProvider } from "@/lib/ai/providers/cloudflare-provider";
import { GroqProvider } from "@/lib/ai/providers/groq-provider";
import { MockProvider } from "@/lib/ai/providers/mock-provider";
import type { LLMProvider } from "@/lib/ai/providers/provider";
import type { ProviderChatParams, ProviderChatResult } from "@/lib/ai/types";

// Registro de proveedores conocidos. Añadir uno nuevo = registrar aquí; el
// resto del código no cambia.
function buildProvider(name: string): LLMProvider | null {
  switch (name) {
    case "groq":
      return new GroqProvider();
    case "cloudflare":
      return new CloudflareProvider();
    case "mock":
      return new MockProvider();
    default:
      return null;
  }
}

// Enruta la petición al proveedor principal y, ante fallos recuperables
// (429/5xx/timeout), recorre la cadena de respaldo (paso 9 del orquestador).
export class ProviderRouter {
  private readonly chain: LLMProvider[];

  constructor() {
    if (AI_CONFIG.mockEnabled) {
      this.chain = [new MockProvider()];
      return;
    }

    const names = [AI_CONFIG.provider, ...AI_CONFIG.fallbackProviders];
    const configured = names
      .map(buildProvider)
      .filter((provider): provider is LLMProvider => provider !== null && provider.isConfigured());

    // Sin proveedor real configurado: en desarrollo se permite el mock para no
    // bloquear; en producción no (mejor fallar ruidosamente).
    if (configured.length === 0 && AI_CONFIG.allowMockFallback) {
      console.warn("[ai] Ningún proveedor de IA configurado; usando MockProvider (solo desarrollo).");
      this.chain = [new MockProvider()];
    } else {
      this.chain = configured;
    }
  }

  get providers(): readonly LLMProvider[] {
    return this.chain;
  }

  async chatComplete(params: ProviderChatParams): Promise<ProviderChatResult> {
    if (this.chain.length === 0) throw new NoProviderAvailableError();

    let lastError: unknown = null;
    for (let index = 0; index < this.chain.length; index++) {
      const provider = this.chain[index];
      try {
        return await provider.chatComplete(params);
      } catch (error) {
        lastError = error;
        const retryable = error instanceof ProviderError ? error.retryable : false;
        const hasNext = index < this.chain.length - 1;
        if (!retryable || !hasNext) throw error;
        console.warn(`[ai] Proveedor "${provider.name}" falló (${String(error)}); intentando respaldo.`);
      }
    }

    throw lastError instanceof Error ? lastError : new NoProviderAvailableError();
  }
}

export function createProviderRouter(): ProviderRouter {
  return new ProviderRouter();
}
