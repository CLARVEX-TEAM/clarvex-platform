import * as XLSX from "@/lib/spreadsheet";

export type ParsedScheduleStatus = "WORKING" | "OFF" | "VACATION" | "PAID_DAY" | "INVENTORY" | "TERMINATED";

export type ParsedSchedule = {
  employeeNumber: string;
  employeeName: string;
  date: Date;
  day: string;
  weekStart: Date;
  weekLabel: string;
  status: ParsedScheduleStatus;
  statusRaw: string;
  startTime: string | null;
  endTime: string | null;
  sheetName: string;
};

export type ScheduleParseResult = {
  records: ParsedSchedule[];
  weeks: string[];
  employeeNumbers: string[];
  unknownValues: Record<string, number>;
};

const dayDefinitions = [
  { normalized: "DOMINGO", short: "Dom" },
  { normalized: "LUNES", short: "Lun" },
  { normalized: "MARTES", short: "Mar" },
  { normalized: "MIERCOLES", short: "Mie" },
  { normalized: "JUEVES", short: "Jue" },
  { normalized: "VIERNES", short: "Vie" },
  { normalized: "SABADO", short: "Sab" }
] as const;

const statusMap: Record<string, ParsedScheduleStatus> = {
  LABORANDO: "WORKING",
  DESCANSO: "OFF",
  VACACIONES: "VACATION",
  "PAGO DIA": "PAID_DAY",
  CONTEO: "INVENTORY",
  BAJA: "TERMINATED"
};

export function parseScheduleWorkbook(workbook: XLSX.WorkBook): ScheduleParseResult {
  const records: ParsedSchedule[] = [];
  const weeks = new Set<string>();
  const employeeNumbers = new Set<string>();
  const unknownValues: Record<string, number> = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: true,
      defval: null,
      raw: true
    }) as unknown[][];

    for (let headerIndex = 0; headerIndex < rows.length; headerIndex += 1) {
      const columns = detectHeader(rows[headerIndex] ?? []);
      if (!columns) continue;

      const dateRowIndex = findDateRow(rows, headerIndex, columns.days);
      if (dateRowIndex === -1) continue;

      const datedDays = columns.days.flatMap((day) => {
        const date = parseExcelDate(rows[dateRowIndex]?.[day.column]);
        return date ? [{ ...day, date }] : [];
      });
      if (datedDays.length === 0) continue;

      const weekStart = datedDays.reduce((earliest, day) => day.date < earliest ? day.date : earliest, datedDays[0].date);
      const weekLabel = findWeekLabel(rows, headerIndex) || formatDateKey(weekStart);
      weeks.add(`${sheetName}: ${weekLabel}`);

      for (let rowIndex = dateRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] ?? [];
        if (detectHeader(row)) break;

        const rowText = normalizeText(row.filter((value) => value !== null).join(" "));
        if (rowText.includes("NO PERSONAS LABORANDO POR DIA")) continue;

        const employeeNumber = normalizeEmployeeNumber(row[columns.employee]);
        if (!employeeNumber) continue;
        employeeNumbers.add(employeeNumber);
        const employeeName = cleanCell(row[columns.name]);

        for (const day of datedDays) {
          const statusRaw = cleanCell(row[day.column]);
          if (!statusRaw) continue;

          // Una celda con rango de horas (ej. "10:30-19:00" o "12-9") es un
          // turno LABORANDO con hora de entrada y salida. Si no es horario, se
          // interpreta como estatus (LABORANDO/DESCANSO/...).
          const shift = parseTimeRange(statusRaw);
          const status = shift ? "WORKING" : statusMap[normalizeText(statusRaw)];
          if (!status) {
            unknownValues[statusRaw] = (unknownValues[statusRaw] ?? 0) + 1;
            continue;
          }

          records.push({
            employeeNumber,
            employeeName,
            date: day.date,
            day: day.short,
            weekStart,
            weekLabel,
            status,
            statusRaw,
            startTime: shift?.start ?? null,
            endTime: shift?.end ?? null,
            sheetName
          });
        }
      }
    }
  }

  return {
    records: deduplicateRecords(records),
    weeks: Array.from(weeks),
    employeeNumbers: Array.from(employeeNumbers),
    unknownValues
  };
}

// Detecta un rango de horas en la celda: "10:30-19:00", "10:30 a 7", "12-9"…
// Convención retail: si la hora de salida es menor o igual a la de entrada, se
// asume PM (entra 12, sale 9 → 21:00). Devuelve horas normalizadas "HH:MM".
function parseTimeRange(value: unknown): { start: string; end: string } | null {
  const text = cleanCell(value);
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(?:-|–|—|a|to)\s*(\d{1,2})(?::(\d{2}))?$/i);
  if (!match) return null;
  let startH = Number(match[1]);
  const startM = match[2] ? Number(match[2]) : 0;
  let endH = Number(match[3]);
  const endM = match[4] ? Number(match[4]) : 0;
  if (startH > 23 || endH > 23 || startM > 59 || endM > 59) return null;
  // Salida en formato 12h que cae en la tarde/noche.
  if (endH < startH || (endH === startH && endM <= startM)) { if (endH <= 11) endH += 12; }
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${pad(startH)}:${pad(startM)}`, end: `${pad(endH)}:${pad(endM)}` };
}

function detectHeader(row: unknown[]) {
  const normalized = row.map(normalizeText);
  const employee = normalized.findIndex((value) => value.includes("DE EMPLEADO"));
  const name = normalized.findIndex((value) => value === "NOMBRE" || value.includes("NOMBRE EMPLEADO"));
  const days = dayDefinitions.flatMap((definition) => {
    const column = normalized.findIndex((value) => value === definition.normalized);
    return column >= 0 ? [{ ...definition, column }] : [];
  });

  return employee >= 0 && name >= 0 && days.length >= 3 ? { employee, name, days } : null;
}

function findDateRow(rows: unknown[][], headerIndex: number, days: Array<{ column: number }>) {
  const lastCandidate = Math.min(rows.length - 1, headerIndex + 4);
  for (let index = headerIndex + 1; index <= lastCandidate; index += 1) {
    const validDates = days.filter((day) => parseExcelDate(rows[index]?.[day.column])).length;
    if (validDates >= 3) return index;
  }
  return -1;
}

function findWeekLabel(rows: unknown[][], headerIndex: number) {
  for (let index = headerIndex; index >= Math.max(0, headerIndex - 6); index -= 1) {
    const row = rows[index] ?? [];
    for (let column = 0; column < row.length; column += 1) {
      const value = cleanCell(row[column]);
      const normalized = normalizeText(value);
      if (!normalized.includes("SEMANA")) continue;

      const inline = value.replace(/semana\s*:?/i, "").trim();
      if (inline) return inline;
      const adjacent = cleanCell(row[column + 1]);
      if (adjacent) return adjacent;
    }
  }
  return "";
}

function parseExcelDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return utcDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? utcDate(parsed.y, parsed.m, parsed.d) : null;
  }

  const text = cleanCell(value);
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if (!match) return null;
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  return utcDate(year, Number(match[2]), Number(match[1]));
}

function utcDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function normalizeEmployeeNumber(value: unknown) {
  const employeeNumber = typeof value === "number" && Number.isFinite(value)
    ? String(Math.trunc(value))
    : cleanCell(value).replace(/\.0+$/, "").replace(/\s+/g, "");
  return /^\d+$/.test(employeeNumber) ? employeeNumber : "";
}

function cleanCell(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

function normalizeText(value: unknown) {
  return cleanCell(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function deduplicateRecords(records: ParsedSchedule[]) {
  const unique = new Map<string, ParsedSchedule>();
  for (const record of records) {
    unique.set(`${record.employeeNumber}:${formatDateKey(record.date)}`, record);
  }
  return Array.from(unique.values());
}
