import type { ProviderChatParams, ProviderChatResult } from "@/lib/ai/types";

// Contrato que todo proveedor de IA debe implementar. El resto de la aplicación
// solo conoce esta interfaz, nunca a Groq/Cloudflare directamente.
export interface LLMProvider {
  readonly name: string;
  // ¿Tiene credenciales/base URL suficientes para operar?
  isConfigured(): boolean;
  chatComplete(params: ProviderChatParams): Promise<ProviderChatResult>;
}
