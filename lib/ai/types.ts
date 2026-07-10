// Contrato neutral de IA (estilo chat-completions con tool-calling). Mapea de
// forma directa a Groq y Cloudflare Workers AI (ambos compatibles con la API de
// OpenAI), sin acoplar el resto del código a un proveedor concreto.

import type { ModelTier } from "@/lib/ai/config";
import type { Role } from "@/lib/types";

export type { ModelTier };

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ProviderToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

// Llamada a herramienta solicitada por el modelo. `arguments` es un string JSON
// (formato OpenAI/Groq); el orquestador lo valida antes de ejecutar.
export type ProviderToolCall = {
  id: string;
  name: string;
  arguments: string;
};

// Esquema de herramienta expuesto al proveedor (JSON Schema de parámetros).
export type ProviderToolSchema = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ProviderChatParams = {
  model: string;
  messages: ChatMessage[];
  tools?: ProviderToolSchema[];
  temperature?: number;
  maxTokens?: number;
  // Fuerza salida JSON (para features single-shot que hacen JSON.parse). El
  // prompt debe mencionar "JSON" (requisito de la API compatible con OpenAI).
  jsonMode?: boolean;
  signal?: AbortSignal;
};

export type ProviderChatResult = {
  content: string | null;
  toolCalls: ProviderToolCall[];
  usage: TokenUsage | null;
  model: string;
  provider: string;
  finishReason: string | null;
};

// Contexto de identidad del Copilot. Se construye SIEMPRE desde la sesión
// validada en el backend; nunca desde el cliente ni desde el modelo.
export type CopilotContext = {
  userId: string;
  storeId: string;
  role: Role;
  name: string;
  platformAdmin: boolean;
  // Fecha/zona de referencia para resolver "hoy", "esta semana", etc.
  now: Date;
  timeZone: string;
};

// Resultado de la ejecución de una herramienta. `data` es lo que ve el modelo
// (ya calculado y filtrado por rol/tienda). `error` describe un fallo controlado.
export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

// Acción propuesta por el Copilot (Fase 3) que requiere confirmación explícita
// del usuario antes de ejecutarse. La UI la muestra con un botón de confirmar.
export type PendingAction = {
  proposalId: string;
  type: string;
  summary: string;
};

export type CopilotTurn = {
  answer: string;
  usage: TokenUsage;
  toolInvocations: Array<{ name: string; ok: boolean }>;
  pendingActions: PendingAction[];
  model: string;
  modelTier: ModelTier;
  provider: string;
  iterations: number;
};
