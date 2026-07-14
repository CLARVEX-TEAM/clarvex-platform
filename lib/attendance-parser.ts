import type { WorkBook } from "@/lib/spreadsheet";

/**
 * Parser de la hoja "APERTURA" del archivo de asistencia (SharePoint).
 *
 * Esa hoja se SOBRESCRIBE cada día: solo contiene la captura del día en curso.
 * Por eso el cron la baja varias veces al día y la guarda — si no, se pierde.
 *
 * Mapa verificado contra APERTURA_SAN_AGUSTIN.xlsx (jul-2026). Índices en base 0,
 * como los entrega lib/spreadsheet (columna A = 0):
 *
 *   [1]  B  → número de empleado
 *   [2]  C  → nombre completo
 *   [3]  D  → ENTRADA (hora del POS, o texto: "VACACIONES", "FALTA"…)
 *   [4]  E  → COMIDA desde
 *   [6]  G  → SALIDA
 *   fila 3, [12] M → fecha del día (fórmula TODAY())
 *   Filas de datos: las que traen número de empleado en B (de la 5 en adelante)
 */

export type ParsedAttendanceRow = {
  employeeNumber: string;
  name: string;
  /** Hora de entrada "HH:MM" cuando la celda traía una hora. */
  arrived: string | null;
  /** Texto de la celda de entrada cuando NO era hora ("VACACIONES", "FALTA"). */
  entryText: string | null;
  lunchStart: string | null;
  leftAt: string | null;
};

export type AttendanceParseResult = {
  /** Fecha que declara la hoja (celda M3). "YYYY-MM-DD". */
  sheetDate: string | null;
  rows: ParsedAttendanceRow[];
  /** Textos de la columna ENTRADA que el parser no supo interpretar. */
  unknownEntries: Record<string, number>;
};

/** Textos conocidos en la columna ENTRADA que NO son una hora. */
const KNOWN_TEXTS = new Set([
  "FALTA", "VACACIONES", "DESCANSO", "DESC", "PAGO", "PAGO DIA", "PAGO DÍA",
  "CONTEO", "INCAPACIDAD", "PERMISO", "BAJA"
]);

const SHEET_NAME = "APERTURA";
const DATE_ROW = 2;   // fila 3
const DATE_COL = 12;  // columna M
const FIRST_DATA_ROW = 4; // fila 5

/**
 * Las horas de Excel llegan como Date con fecha base 1899-12-30 y la hora en
 * UTC ("10:37" → 1899-12-30T10:37:00.000Z). Se lee en UTC A PROPÓSITO: usar la
 * zona local del servidor correría la hora y falsearía los retardos.
 */
function toTime(value: unknown): string | null {
  if (value instanceof Date) {
    const hours = String(value.getUTCHours()).padStart(2, "0");
    const minutes = String(value.getUTCMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  // Algunas celdas llegan como serial de Excel (fracción de día).
  if (typeof value === "number" && value > 0 && value < 1) {
    const total = Math.round(value * 24 * 60);
    const hours = String(Math.floor(total / 60)).padStart(2, "0");
    const minutes = String(total % 60).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  return null;
}

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function toDateKey(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

export function parseAttendanceWorkbook(workbook: WorkBook): AttendanceParseResult {
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`El archivo de asistencia no tiene la hoja "${SHEET_NAME}".`);
  }

  const sheetDate = toDateKey(sheet[DATE_ROW]?.[DATE_COL]);
  const rows: ParsedAttendanceRow[] = [];
  const unknownEntries: Record<string, number> = {};

  for (let index = FIRST_DATA_ROW; index < sheet.length; index += 1) {
    // Densificar: las filas de exceljs son arrays sparse (ver CLAUDE.md).
    const cells = Array.from(sheet[index] ?? [], (value) => value ?? null);

    const rawNumber = cells[1];
    const employeeNumber =
      typeof rawNumber === "number" ? String(rawNumber)
      : typeof rawNumber === "string" && /^\d+$/.test(rawNumber.trim()) ? rawNumber.trim()
      : null;
    if (!employeeNumber) continue; // no es fila de colaborador

    const name = toText(cells[2]);
    if (!name) continue;

    const arrived = toTime(cells[3]);
    const entryText = arrived ? null : toText(cells[3]);

    if (entryText && !KNOWN_TEXTS.has(entryText.toUpperCase())) {
      unknownEntries[entryText] = (unknownEntries[entryText] ?? 0) + 1;
    }

    rows.push({
      employeeNumber,
      name,
      arrived,
      entryText,
      lunchStart: toTime(cells[4]),
      leftAt: toTime(cells[6])
    });
  }

  return { sheetDate, rows, unknownEntries };
}
