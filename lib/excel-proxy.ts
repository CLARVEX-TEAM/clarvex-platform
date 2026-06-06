import * as XLSX from "xlsx";
import type { SheetSummary } from "@/lib/data-source";

const MAX_EXCEL_BYTES = 20 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const excelContentTypes = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel"
];

export type WorkbookSummary = {
  sheets: SheetSummary[];
  recordsProcessed: number;
};

export async function downloadExcelWorkbook(sourceUrl: string | null) {
  if (!sourceUrl) {
    throw new Error("La fuente no tiene una URL configurada.");
  }

  const workerUrl = process.env.EXCEL_PROXY_WORKER_URL?.trim();
  if (!workerUrl || workerUrl.includes("TU_WORKER")) {
    throw new Error("Configura EXCEL_PROXY_WORKER_URL con la URL del Worker de Cloudflare.");
  }

  const requestUrl = buildWorkerDownloadUrl(workerUrl, sourceUrl);

  console.info(`[excel-proxy] GET ${requestUrl.toString()}`);

  const response = await fetch(requestUrl, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  console.info(`[excel-proxy] Worker HTTP ${response.status} ${requestUrl.toString()}`);

  if (!response.ok) {
    const workerError = await readWorkerError(response);
    console.error(`[excel-proxy] Worker error body (200 chars): ${workerError.preview || "<empty>"}`);
    throw new Error(workerError.message || `El Worker respondio con HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const contentDisposition = response.headers.get("content-disposition")?.toLowerCase() ?? "";
  const isExcel = excelContentTypes.includes(contentType) ||
    ((contentType === "application/octet-stream" || contentType === "application/zip") && contentDisposition.includes(".xlsx"));

  if (!isExcel) {
    throw new Error(`El Worker no devolvio un archivo Excel valido (content-type: ${contentType || "desconocido"}).`);
  }

  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_EXCEL_BYTES) {
    throw new Error("El archivo Excel supera el limite de 20 MB.");
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error("El Worker devolvio un archivo Excel vacio.");
  }
  if (buffer.byteLength > MAX_EXCEL_BYTES) {
    throw new Error("El archivo Excel supera el limite de 20 MB.");
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", dense: true, cellDates: true });
  } catch {
    throw new Error("No se pudo interpretar el archivo recibido como Excel.");
  }

  return workbook;
}

export function buildWorkerDownloadUrl(workerUrl: string, sourceUrl: string) {
  try {
    const requestUrl = new URL(workerUrl);
    requestUrl.pathname = "/download";
    requestUrl.search = "";
    requestUrl.hash = "";
    requestUrl.searchParams.set("url", sourceUrl);
    return requestUrl;
  } catch {
    throw new Error("EXCEL_PROXY_WORKER_URL no es una URL valida.");
  }
}

export async function downloadWorkbookSummary(sourceUrl: string | null): Promise<WorkbookSummary> {
  return summarizeWorkbook(await downloadExcelWorkbook(sourceUrl));
}

export function summarizeWorkbook(workbook: XLSX.WorkBook): WorkbookSummary {
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      defval: null,
      raw: true
    }) as unknown[][];

    return { name, rowCount: rows.length };
  });

  return {
    sheets,
    recordsProcessed: sheets.reduce((total, sheet) => total + sheet.rowCount, 0)
  };
}

async function readWorkerError(response: Response) {
  try {
    const text = await response.text();
    if (!text) return { message: "", preview: "" };
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 200);

    try {
      const payload = JSON.parse(text) as { error?: unknown; message?: unknown };
      if (typeof payload.error === "string") return { message: payload.error, preview };
      if (typeof payload.message === "string") return { message: payload.message, preview };
    } catch {
      // The Worker may return a plain-text explanation.
    }

    return {
      message: text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400),
      preview
    };
  } catch {
    return { message: "", preview: "" };
  }
}
