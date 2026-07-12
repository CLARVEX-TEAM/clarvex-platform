import {
  PowerBiExportError,
  PowerBiInvalidResponseError,
  PowerBiTokenExpiredError
} from "@/lib/integrations/power-bi-errors";
import { minimalExportHeaders } from "@/lib/integrations/power-bi-fetch-parser";

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;
const DEFAULT_TIMEOUT_MS = 60_000;
const XLSX_CONTENT_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream"
];

export type PowerBiExportOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

function isZipBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return ZIP_MAGIC.every((byte, index) => buffer[index] === byte);
}

function mapHttpError(status: number, bodyText: string): PowerBiExportError {
  const lower = bodyText.toLowerCase();
  if (status === 401 || status === 403) {
    return new PowerBiTokenExpiredError();
  }
  if (status === 400 && (lower.includes("token") || lower.includes("unauthorized") || lower.includes("expired"))) {
    return new PowerBiTokenExpiredError();
  }
  if (status === 429) {
    return new PowerBiExportError("Power BI limitó la solicitud (demasiadas exportaciones). Espera e intenta de nuevo.", {
      status,
      code: "POWER_BI_RATE_LIMITED"
    });
  }
  const snippet = bodyText.slice(0, 240).replace(/\s+/g, " ").trim();
  return new PowerBiExportError(
    snippet ? `Power BI respondió ${status}: ${snippet}` : `Power BI respondió ${status}.`,
    { status }
  );
}

/**
 * Exporta un visual de Power BI a Excel vía POST /export/xlsx (fetch de DevTools).
 *
 * Reutilizable con solo URL + Bearer + payload JSON si el token sigue vigente.
 * NO guarda ni registra el token.
 */
export async function exportPowerBI(
  bearerToken: string,
  payload: object,
  url: string,
  options: PowerBiExportOptions = {}
): Promise<Buffer> {
  const endpoint = url.trim();
  if (!endpoint) throw new PowerBiExportError("URL de exportación vacía.");
  if (!payload || typeof payload !== "object") {
    throw new PowerBiExportError("El payload debe ser un objeto JSON.");
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: minimalExportHeaders(bearerToken),
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === "AbortError";
    throw new PowerBiExportError(
      aborted ? `Tiempo de espera agotado (${timeoutMs}ms) al exportar Power BI.` : "Fallo de red al exportar Power BI.",
      { cause }
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw mapHttpError(response.status, errorText);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length === 0) {
    throw new PowerBiInvalidResponseError("Power BI devolvió un archivo vacío.", { status: response.status });
  }

  const looksLikeXlsx =
    isZipBuffer(buffer) ||
    XLSX_CONTENT_TYPES.some((type) => contentType.includes(type)) ||
    contentType.includes("spreadsheetml");

  if (!looksLikeXlsx) {
    const preview = buffer.subarray(0, 200).toString("utf8").replace(/\s+/g, " ").trim();
    const maybeJson = preview.startsWith("{") || preview.startsWith("[");
    throw new PowerBiInvalidResponseError(
      maybeJson
        ? "Power BI no devolvió XLSX (respuesta JSON/HTML). El token puede haber expirado o el payload cambió."
        : "La respuesta no parece un archivo Excel (.xlsx).",
      { status: response.status }
    );
  }

  return buffer;
}

export {
  patchExportPayload,
  patchRetailCalendarFilters,
  findExportDataCommand,
  findSemanticQuery,
  summarizeExportPayload
} from "@/lib/integrations/power-bi-payload";
export type { PowerBiCalendarFilter, PowerBiExportPatch } from "@/lib/integrations/power-bi-payload";
