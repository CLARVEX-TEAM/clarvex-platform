// Errores tipados del subsistema de IA. Permiten al orquestador distinguir
// fallos recuperables (reintentar / hacer fallback) de fallos definitivos.

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

// Fallo de un proveedor (red, 5xx, timeout, respuesta inválida). El router
// intenta el siguiente proveedor de la cadena de fallback.
export class ProviderError extends AiError {
  readonly provider: string;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(provider: string, message: string, options?: { status?: number | null; retryable?: boolean }) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = options?.status ?? null;
    // 429 y 5xx son recuperables vía fallback; el resto no.
    this.retryable = options?.retryable ?? (options?.status === 429 || (options?.status != null && options.status >= 500));
  }
}

// Ningún proveedor configurado pudo atender la petición.
export class NoProviderAvailableError extends AiError {
  constructor(message = "No hay ningún proveedor de IA disponible.") {
    super(message);
    this.name = "NoProviderAvailableError";
  }
}

// El modelo pidió una herramienta desconocida o con argumentos inválidos.
export class ToolInvocationError extends AiError {
  readonly toolName: string;
  constructor(toolName: string, message: string) {
    super(message);
    this.name = "ToolInvocationError";
    this.toolName = toolName;
  }
}

// Fallo controlado al confirmar/ejecutar una acción propuesta (Fase 3):
// propuesta inexistente, ya procesada, expirada o no autorizada. Mapea a 4xx.
export class ProposalError extends AiError {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ProposalError";
    this.status = status;
  }
}
