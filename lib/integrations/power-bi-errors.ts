export class PowerBiExportError extends Error {
  readonly status: number | null;
  readonly code: string;

  constructor(message: string, options?: { status?: number | null; code?: string; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "PowerBiExportError";
    this.status = options?.status ?? null;
    this.code = options?.code ?? "POWER_BI_EXPORT_FAILED";
  }
}

export class PowerBiTokenExpiredError extends PowerBiExportError {
  constructor(message = "El Bearer token de Power BI expiró o no es válido. Obtén uno nuevo desde DevTools.") {
    super(message, { status: 401, code: "POWER_BI_TOKEN_EXPIRED" });
    this.name = "PowerBiTokenExpiredError";
  }
}

export class PowerBiInvalidResponseError extends PowerBiExportError {
  constructor(message: string, options?: { status?: number | null }) {
    super(message, { status: options?.status ?? null, code: "POWER_BI_INVALID_RESPONSE" });
    this.name = "PowerBiInvalidResponseError";
  }
}
