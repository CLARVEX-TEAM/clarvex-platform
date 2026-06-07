import * as XLSX from "xlsx";
import type { SheetSummary } from "@/lib/data-source";

const MAX_EXCEL_BYTES = 20 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const excelContentTypes = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel"
];

// XLSX files are ZIP archives — validate the magic bytes before parsing
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function hasZipSignature(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const view = new Uint8Array(buffer, 0, 4);
  return ZIP_MAGIC.every((byte, i) => view[i] === byte);
}

export type WorkbookSummary = {
  sheets: SheetSummary[];
  recordsProcessed: number;
};

export async function downloadExcelWorkbook(sourceUrl: string | null) {
  if (!sourceUrl) {
    throw new Error("La fuente no tiene una URL configurada.");
  }

  const workerBaseUrl = process.env.EXCEL_PROXY_WORKER_URL?.trim();
  if (!workerBaseUrl || workerBaseUrl.includes("TU_WORKER")) {
    throw new Error("Configura EXCEL_PROXY_WORKER_URL con la URL del Worker de Cloudflare.");
  }

  const workerUrl = buildWorkerDownloadUrl(workerBaseUrl, sourceUrl);

  const response = await fetch(workerUrl, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    const workerError = await response.text();
    throw new Error(workerError || `El Worker respondio con HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const contentDisposition = response.headers.get("content-disposition")?.toLowerCase() ?? "";
  const isExcel = excelContentTypes.includes(contentType) ||
    ((contentType === "application/octet-stream" || contentType === "application/zip") && contentDisposition.includes(".xlsx"));

  if (!isExcel) {
    const workerText = await response.text();
    throw new Error(workerText || `El Worker no devolvio un archivo Excel valido (content-type: ${contentType || "desconocido"}).`);
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

  if (!hasZipSignature(buffer)) {
    throw new Error("El archivo recibido no tiene una firma XLSX valida.");
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
    const baseUrl = new URL(workerUrl);
    if (baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
      throw new Error("La variable debe contener solo el dominio base del Worker.");
    }
    return `${baseUrl.origin}/download?url=${encodeURIComponent(sourceUrl)}`;
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
