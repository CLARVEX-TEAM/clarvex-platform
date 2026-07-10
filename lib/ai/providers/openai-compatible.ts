import { ProviderError } from "@/lib/ai/errors";
import type { ChatMessage, ProviderChatParams, ProviderChatResult, ProviderToolCall } from "@/lib/ai/types";

// Transporte compartido para proveedores compatibles con la API de OpenAI
// (Groq y Cloudflare Workers AI lo son). Traduce nuestro contrato neutral al
// formato /chat/completions y de vuelta.

type OpenAiToolCall = {
  id?: string;
  function?: { name?: string; arguments?: string };
};

type OpenAiChoice = {
  message?: { content?: string | null; tool_calls?: OpenAiToolCall[] };
  finish_reason?: string | null;
};

type OpenAiResponse = {
  choices?: OpenAiChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string };
};

function toOpenAiMessages(messages: ChatMessage[]) {
  return messages.map((message) => {
    switch (message.role) {
      case "system":
      case "user":
        return { role: message.role, content: message.content };
      case "assistant":
        return {
          role: "assistant" as const,
          content: message.content,
          ...(message.toolCalls && message.toolCalls.length
            ? { tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } })) }
            : {})
        };
      case "tool":
        return { role: "tool" as const, tool_call_id: message.toolCallId, content: message.content };
    }
  });
}

function toOpenAiTools(params: ProviderChatParams) {
  if (!params.tools || params.tools.length === 0) return undefined;
  return params.tools.map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters }
  }));
}

export async function openAiCompatibleChat(options: {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  params: ProviderChatParams;
  timeoutMs: number;
}): Promise<ProviderChatResult> {
  const { providerName, baseUrl, apiKey, params, timeoutMs } = options;
  const tools = toOpenAiTools(params);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  // Si el orquestador ya pasó un signal, encadenarlo con el timeout local.
  if (params.signal) {
    if (params.signal.aborted) controller.abort();
    else params.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: params.model,
        messages: toOpenAiMessages(params.messages),
        ...(tools ? { tools, tool_choice: "auto" } : {}),
        ...(params.jsonMode && !tools ? { response_format: { type: "json_object" } } : {}),
        temperature: params.temperature ?? 0.3,
        ...(params.maxTokens ? { max_tokens: params.maxTokens } : {})
      }),
      signal: controller.signal
    });
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === "AbortError";
    throw new ProviderError(providerName, aborted ? "Tiempo de espera agotado con el proveedor de IA." : `Fallo de red con el proveedor de IA: ${String(cause)}`, { retryable: true });
  } finally {
    clearTimeout(timeout);
  }

  const rawText = await response.text();
  let payload: OpenAiResponse;
  try {
    payload = rawText ? (JSON.parse(rawText) as OpenAiResponse) : {};
  } catch {
    throw new ProviderError(providerName, "Respuesta no-JSON del proveedor de IA.", { status: response.status, retryable: response.status >= 500 });
  }

  if (!response.ok) {
    throw new ProviderError(providerName, payload.error?.message ?? `El proveedor de IA respondió ${response.status}.`, { status: response.status });
  }

  const choice = payload.choices?.[0];
  const toolCalls: ProviderToolCall[] = (choice?.message?.tool_calls ?? [])
    .filter((call): call is Required<Pick<OpenAiToolCall, "function">> & OpenAiToolCall => Boolean(call.function?.name))
    .map((call, index) => ({
      id: call.id ?? `call_${index}`,
      name: call.function?.name ?? "",
      arguments: call.function?.arguments ?? "{}"
    }));

  return {
    content: choice?.message?.content ?? null,
    toolCalls,
    usage: payload.usage
      ? {
          promptTokens: payload.usage.prompt_tokens ?? 0,
          completionTokens: payload.usage.completion_tokens ?? 0,
          totalTokens: payload.usage.total_tokens ?? 0
        }
      : null,
    model: params.model,
    provider: providerName,
    finishReason: choice?.finish_reason ?? null
  };
}
