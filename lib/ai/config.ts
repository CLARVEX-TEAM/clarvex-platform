// Configuración central del subsistema de IA (Copilot). Es el ÚNICO lugar que
// lee variables de entorno de IA: el resto del código depende de esta config,
// nunca de process.env ni del nombre de un proveedor concreto (p.ej. Groq).

export type CopilotPhase = 1 | 2 | 3;
export type ModelTier = "fast" | "advanced";

function intEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Modo mock: en tests o cuando se activan explícitamente los mocks de servicios
// externos. El Copilot lo respeta igual que r2/push/mercadopago.
const mockEnabled = process.env.NODE_ENV === "test" || process.env.MOCK_EXTERNAL_SERVICES === "true";

// Fuera de producción, si el proveedor real no está configurado (sin API key),
// se permite caer al MockProvider para no bloquear el desarrollo local. En
// producción esto está prohibido: un proveedor mal configurado debe fallar.
const allowMockFallback = process.env.NODE_ENV !== "production";

export const AI_CONFIG = {
  // Proveedor principal. La abstracción permite cambiarlo sin tocar el resto.
  provider: process.env.AI_PROVIDER ?? "groq",
  // Cadena de respaldo (fallback) tras el principal. Cloudflare Workers AI es
  // el respaldo previsto para cuando Groq tope límites.
  fallbackProviders: (process.env.AI_FALLBACK_PROVIDERS ?? "cloudflare")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
  models: {
    fast: process.env.AI_MODEL_FAST ?? "openai/gpt-oss-20b",
    advanced: process.env.AI_MODEL_ADVANCED ?? "openai/gpt-oss-120b"
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY ?? "",
    baseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1"
  },
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    apiToken: process.env.CLOUDFLARE_AI_TOKEN ?? "",
    baseUrl: process.env.CLOUDFLARE_AI_BASE_URL ?? ""
  },
  // Fase operativa del Copilot: 1 = solo lectura, 2 = borradores, 3 = acciones
  // con confirmación. Controla qué herramientas expone el registro.
  phase: (intEnv(process.env.AI_COPILOT_PHASE, 1) as CopilotPhase),
  // Tope de vueltas del ciclo de tool-calling (evita bucles y costo desbocado).
  maxToolIterations: intEnv(process.env.AI_MAX_TOOL_ITERATIONS, 5),
  requestTimeoutMs: intEnv(process.env.AI_REQUEST_TIMEOUT_MS, 30_000),
  maxOutputTokens: intEnv(process.env.AI_MAX_OUTPUT_TOKENS, 1_500),
  temperature: 0.3,
  mockEnabled,
  allowMockFallback
} as const;

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
