// Errores tipados del subsistema de IA. Permiten al orquestador distinguir
// fallos recuperables (reintentar / hacer fallback) de fallos definitivos.

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

// Fallo de un proveedor (red, 5xx, timeout, respuesta inválida). El router
// intenta reintento / siguiente proveedor de la cadena de fallback.
export class ProviderError extends AiError {
  readonly provider: string;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(provider: string, message: string, options?: { status?: number | null; retryable?: boolean; retryAfterMs?: number }) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = options?.status ?? null;
    this.retryAfterMs = options?.retryAfterMs;
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

export type UserFacingCopilotError = {
  message: string;
  status: number;
  retryable: boolean;
};

/** Mensaje en español para la UI — nunca exponer errores crudos del proveedor. */
export function toUserFacingCopilotError(error: unknown): UserFacingCopilotError {
  if (error instanceof NoProviderAvailableError) {
    return {
      message: "El asistente no está disponible en este momento. Intenta de nuevo en unos minutos.",
      status: 503,
      retryable: true
    };
  }
  if (error instanceof ProviderError) {
    // 402 = el proveedor de IA se quedó sin saldo o sin cuota.
    //
    // Antes caía en «no pudimos conectar», que hacía pensar en un problema de
    // red y llevaba a reintentar en balde: la cuota no se repone reintentando.
    // El mensaje separa lo que el usuario puede hacer (esperar) de lo que solo
    // puede resolver quien administra la app.
    if (error.status === 402) {
      return {
        message: "El asistente agotó su cuota de uso. Vuelve a intentarlo más tarde; si sigue igual, avisa a quien administra la app.",
        status: 503,
        retryable: false
      };
    }
    if (error.status === 429) {
      return {
        message: "El asistente está muy solicitado ahora mismo. Espera unos segundos e intenta de nuevo.",
        status: 503,
        retryable: true
      };
    }
    if (error.retryable) {
      return {
        message: "Hubo un problema temporal con el asistente. Intenta de nuevo en un momento.",
        status: 503,
        retryable: true
      };
    }
    return {
      message: "No pudimos conectar con el asistente. Intenta más tarde.",
      status: 502,
      retryable: false
    };
  }
  return {
    message: "No pudimos procesar tu pregunta. Intenta de nuevo.",
    status: 500,
    retryable: true
  };
}
