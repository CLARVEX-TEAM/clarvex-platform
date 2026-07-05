import * as XLSX from "@/lib/spreadsheet";

export const RDV_SHEET_NAME = "Diario de ventas";

export type RdvWeekRange = { weekNumber: number; weekStart: Date; weekEnd: Date };

export type ParsedKpiRecord = {
  employeeNumber: string;
  employeeName: string;
  role: string;
  date: Date;
  weekNumber: number;
  weekStart: Date;
  weekEnd: Date;
  dailyGoal: number;
  dailySales: number;
  transactions: number;
  pieces: number;
  crmTransactions: number;
  orkestraSales: number;
  orkestraTransactions: number;
  orkestraPieces: number;
  traffic: number | null;
  upt: number;
  aur: number;
  ept: number;
  conversion: number | null;
  achievement: number;
};

export type KpiParseResult = {
  sheetUsed: typeof RDV_SHEET_NAME;
  records: ParsedKpiRecord[];
  employeeNumbers: string[];
  weeksDetected: RdvWeekRange[];
  retailMonthLabel: string;
  retailMonthStart: Date;
  retailMonthEnd: Date;
  crmTransactionsTotal: number;
  totalSalesImported: number;
  totalGoalImported: number;
  rowsRead: number;
  ignoredRows: number;
  ttlsTraffic: number | null;
  ttlsMeta: number;
  ttlsSales: number;
  ttlsTransactions: number;
  ttlsPieces: number;
  employeeTtlsGoals: Record<string, number>;
  employeeCommissionMinimums: Record<string, number>;
  storeTtlsCommissionMinimum: number | null;
};

type EmployeeGroup = {
  employeeNumber: string;
  employeeName: string;
  role: string;
  start: number;
  end: number;
  columns: Partial<Record<MetricKey, number>>;
};

type MetricKey = "dailyGoal" | "dailySales" | "transactions" | "pieces" | "crmTransactions" | "orkestraSales" | "orkestraTransactions" | "orkestraPieces";

export function parseKpiWorkbook(workbook: XLSX.WorkBook): KpiParseResult {
  const sheetName = workbook.SheetNames.find((name) => normalizeText(name) === normalizeText(RDV_SHEET_NAME));
  if (!sheetName) throw new Error('No se encontro la hoja "Diario de ventas".');

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    blankrows: true,
    defval: null,
    raw: true
  }) as unknown[][];
  const headerRow = rows.findIndex((row) => {
    const headers = row.map(normalizeText);
    return headers.some((header) => header === "META DIARIA") && headers.some((header) => header.includes("VTAS TTLS SIN IVA"));
  });
  if (headerRow < 3) throw new Error("La hoja Diario de ventas no contiene el encabezado esperado en la fila 9.");

  const groups = detectEmployeeGroups(rows, headerRow);
  if (groups.length === 0) throw new Error("No se detectaron colaboradores en la fila 7 de Diario de ventas.");

  const dateColumn = detectDateColumn(rows[headerRow] ?? []);
  // Traffic column = first column of TOTALES section (authoritative anchor for totalesStart)
  const trafficColumnFromHeader = detectTrafficColumn(rows[headerRow] ?? []);
  const totalesStart = trafficColumnFromHeader ?? groups[groups.length - 1].end;
  const trafficColumn = totalesStart;
  const retailMonth = detectRetailMonth(rows, headerRow, dateColumn, groups[0].start);
  const records: ParsedKpiRecord[] = [];
  let activeWeek: { weekNumber: number; dates: Date[]; records: ParsedKpiRecord[] } | null = null;
  const weeksDetected: RdvWeekRange[] = [];
  let rowsRead = 0;
  let ignoredRows = 0;
  let ttlsTraffic: number | null = null;
  let ttlsMeta = 0;
  let ttlsSales = 0;
  let ttlsTransactions = 0;
  let ttlsPieces = 0;
  let ttlsParsed = false;
  const employeeTtlsGoals: Record<string, number> = {};

  for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const rowLabel = normalizeText(row.slice(0, Math.max(2, groups[0].start)).join(" "));
    const isTtlsRow = !ttlsParsed && row.some((cell) => normalizeText(cell).includes("TTLS") && !normalizeText(cell).includes("VTAS"));
    if (!row.some((value) => cleanCell(value))) continue;
    rowsRead += 1;
    const detectedWeekNumber = findWeekNumber(row);
    if (detectedWeekNumber !== null) {
      finalizeWeek(activeWeek, retailMonth.end, weeksDetected);
      activeWeek = { weekNumber: detectedWeekNumber, dates: [], records: [] };
    }
    if (isTtlsRow || ["BONOS", "INCIDENCIAS"].some((label) => rowLabel.includes(label))) {
      if (isTtlsRow) {
        const traf = integerCell(row[totalesStart]);
        ttlsTraffic = traf > 0 ? traf : null;
        ttlsMeta = numericCell(row[totalesStart + 1]);
        ttlsSales = numericCell(row[totalesStart + 2]);
        ttlsTransactions = integerCell(row[totalesStart + 3]);
        ttlsPieces = integerCell(row[totalesStart + 4]);
        ttlsParsed = true;
        for (const group of groups) {
          const ttlsGoal = numericCell(row[group.columns.dailyGoal ?? -1]);
          if (ttlsGoal > 0) employeeTtlsGoals[group.employeeNumber] = ttlsGoal;
        }
      }
      ignoredRows += 1;
      continue;
    }

    const date = findRowDate(row, dateColumn, groups[0].start);
    if (!date) {
      if (detectedWeekNumber === null) ignoredRows += 1;
      continue;
    }
    if (!activeWeek) {
      ignoredRows += 1;
      continue;
    }
    activeWeek?.dates.push(date);

    const recordsBeforeRow = records.length;
    const trafficValue = integerCell(row[trafficColumn]);
    const traffic = trafficValue > 0 ? trafficValue : null;

    for (const group of groups) {
      const dailyGoal = numericCell(row[group.columns.dailyGoal ?? -1]);
      const dailySales = numericCell(row[group.columns.dailySales ?? -1]);
      const transactions = integerCell(row[group.columns.transactions ?? -1]);
      const pieces = integerCell(row[group.columns.pieces ?? -1]);
      const crmTransactions = integerCell(row[group.columns.crmTransactions ?? -1]);
      const orkestraSales = numericCell(row[group.columns.orkestraSales ?? -1]);
      const orkestraTransactions = integerCell(row[group.columns.orkestraTransactions ?? -1]);
      const orkestraPieces = integerCell(row[group.columns.orkestraPieces ?? -1]);
      if (dailyGoal === 0 && dailySales === 0) continue;

      const record: ParsedKpiRecord = {
        employeeNumber: group.employeeNumber,
        employeeName: group.employeeName,
        role: group.role,
        date,
        weekNumber: activeWeek.weekNumber,
        weekStart: date,
        weekEnd: date,
        dailyGoal,
        dailySales,
        transactions,
        pieces,
        crmTransactions,
        orkestraSales,
        orkestraTransactions,
        orkestraPieces,
        traffic,
        upt: ratio(pieces, transactions),
        aur: ratio(dailySales, pieces),
        ept: ratio(dailySales, transactions),
        conversion: traffic ? ratio(transactions * 100, traffic) : null,
        achievement: dailyGoal > 0 ? round((dailySales / dailyGoal) * 100) : 0
      };
      records.push(record);
      activeWeek?.records.push(record);
    }
    if (records.length === recordsBeforeRow) ignoredRows += 1;
  }
  finalizeWeek(activeWeek, retailMonth.end, weeksDetected);

  const retailMonthStart = weeksDetected[0]?.weekStart ?? retailMonth.start;

  const uniqueRecords = deduplicate(records);
  const { employeeMinimums: employeeCommissionMinimums, storeMinimum: storeTtlsCommissionMinimum } = parseCommissionSheet(workbook);
  return {
    sheetUsed: RDV_SHEET_NAME,
    records: uniqueRecords,
    employeeNumbers: Array.from(new Set(groups.map((group) => group.employeeNumber))),
    weeksDetected,
    retailMonthLabel: retailMonth.label,
    retailMonthStart,
    retailMonthEnd: weeksDetected[weeksDetected.length - 1]?.weekEnd ?? retailMonth.end,
    crmTransactionsTotal: uniqueRecords.reduce((total, record) => total + record.crmTransactions, 0),
    totalSalesImported: round(uniqueRecords.reduce((total, record) => total + record.dailySales, 0)),
    totalGoalImported: round(uniqueRecords.reduce((total, record) => total + record.dailyGoal, 0)),
    rowsRead,
    ignoredRows,
    ttlsTraffic,
    ttlsMeta,
    ttlsSales,
    ttlsTransactions,
    ttlsPieces,
    employeeTtlsGoals,
    employeeCommissionMinimums,
    storeTtlsCommissionMinimum
  };
}

function parseCommissionSheet(workbook: XLSX.WorkBook): { employeeMinimums: Record<string, number>; storeMinimum: number | null } {
  const sheetName = workbook.SheetNames.find((name) => normalizeText(name) === "COMISIONES");
  if (!sheetName) return { employeeMinimums: {}, storeMinimum: null };

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1, blankrows: true, defval: null, raw: true
  }) as unknown[][];

  const headerRow = rows.findIndex((row) =>
    row.some((cell) => normalizeText(cell).includes("DE EMPLEADO")) &&
    row.some((cell) => normalizeText(cell) === "MINIMO")
  );
  if (headerRow < 0) return { employeeMinimums: {}, storeMinimum: null };

  const headers = rows[headerRow] ?? [];
  const employeeCol = headers.findIndex((cell) => normalizeText(cell).includes("DE EMPLEADO"));
  const minimoCol = headers.findIndex((cell) => normalizeText(cell) === "MINIMO");
  if (employeeCol < 0 || minimoCol < 0) return { employeeMinimums: {}, storeMinimum: null };

  const employeeMinimums: Record<string, number> = {};
  let storeMinimum: number | null = null;

  for (let i = headerRow + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const minimo = numericCell(row[minimoCol]);
    if (minimo <= 0) continue;
    const isTotalesRow = row.slice(0, minimoCol).some((cell) => normalizeText(cell).includes("TOTAL"));
    if (isTotalesRow) {
      storeMinimum = minimo;
      continue;
    }
    const empNum = employeeNumberCell(row[employeeCol]);
    if (empNum) employeeMinimums[empNum] = minimo;
  }

  return { employeeMinimums, storeMinimum };
}

function findWeekNumber(row: unknown[]) {
  const label = normalizeText(row.join(" "));
  const match = label.match(/\bSEMANA\s*(?:NO\.?\s*)?(\d{1,2})\b/);
  return match ? Number(match[1]) : null;
}

function finalizeWeek(week: { weekNumber: number; dates: Date[]; records: ParsedKpiRecord[] } | null, _retailMonthEnd: Date, ranges: RdvWeekRange[]) {
  if (!week || week.dates.length === 0) return;

  // Some RDV files place META DIARIA only in the first row of each week.
  // Propagate the daily goal to zero-goal records only when a single row has it — meaning the
  // RDV encoded the per-day rate once for the whole week.  When multiple rows already carry a
  // non-zero goal, each day's value is intentional and days with zero (e.g. Sunday with sales
  // but no assigned goal) must stay at zero to avoid inflating the weekly total.
  const goalByEmployee = new Map<string, { value: number; count: number }>();
  for (const record of week.records) {
    if (record.dailyGoal > 0) {
      const info = goalByEmployee.get(record.employeeNumber);
      goalByEmployee.set(record.employeeNumber, { value: info?.value ?? record.dailyGoal, count: (info?.count ?? 0) + 1 });
    }
  }
  for (const record of week.records) {
    if (record.dailyGoal === 0) {
      const info = goalByEmployee.get(record.employeeNumber);
      if (info && info.count === 1) record.dailyGoal = info.value;
    }
  }

  const weekStart = new Date(Math.min(...week.dates.map((date) => date.getTime())));
  const weekEnd = new Date(Math.max(...week.dates.map((date) => date.getTime())));
  ranges.push({ weekNumber: week.weekNumber, weekStart, weekEnd });
  for (const record of week.records) {
    record.weekStart = weekStart;
    record.weekEnd = weekEnd;
  }
}

function detectRetailMonth(rows: unknown[][], headerRow: number, dateColumn: number, employeeStart: number) {
  const monthNames = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  let monthIndex = -1;
  for (let rowIndex = 0; rowIndex < headerRow; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const monthCell = row.findIndex((value) => normalizeText(value) === "MES");
    if (monthCell < 0) continue;
    monthIndex = row.slice(monthCell + 1).map(normalizeText).map((value) => monthNames.indexOf(value)).find((index) => index >= 0) ?? -1;
    if (monthIndex >= 0) break;
  }
  const firstDate = rows.slice(headerRow + 1).map((row) => findRowDate(row, dateColumn, employeeStart)).find((date): date is Date => Boolean(date));
  if (monthIndex < 0 || !firstDate) throw new Error("No se pudo detectar el mes retail de Diario de ventas.");
  const year = firstDate.getUTCMonth() > monthIndex ? firstDate.getUTCFullYear() + 1 : firstDate.getUTCFullYear();
  return {
    label: `${titleCase(monthNames[monthIndex])} ${year}`,
    start: new Date(Date.UTC(year, monthIndex, 1)),
    end: new Date(Date.UTC(year, monthIndex + 1, 0))
  };
}

function titleCase(value: string) { return value.charAt(0) + value.slice(1).toLowerCase(); }

function detectEmployeeGroups(rows: unknown[][], headerRow: number): EmployeeGroup[] {
  const roleRow = headerRow - 3;
  const employeeRowIndex = headerRow - 2;
  const nameRow = headerRow - 1;
  const employeeRow = rows[employeeRowIndex] ?? [];
  const allStarts = employeeRow.flatMap((value, column) => {
    const employeeNumber = employeeNumberCell(value);
    return employeeNumber ? [{ employeeNumber, column }] : [];
  });
  const starts = allStarts.filter((item, index) =>
    index === 0 || item.employeeNumber !== allStarts[index - 1].employeeNumber
  );

  return starts.map((item, index) => {
    const end = starts[index + 1]?.column ?? Math.max(employeeRow.length, rows[headerRow]?.length ?? 0);
    const headers = rows[headerRow] ?? [];
    const columns: EmployeeGroup["columns"] = {};
    for (let column = item.column; column < end; column += 1) {
      const metric = metricFromHeader(headers[column]);
      if (metric && columns[metric] === undefined) columns[metric] = column;
    }
    if (columns.dailyGoal !== undefined) {
      if (columns.transactions === undefined && columns.dailyGoal + 2 < end) columns.transactions = columns.dailyGoal + 2;
      if (columns.pieces === undefined && columns.dailyGoal + 3 < end) columns.pieces = columns.dailyGoal + 3;
    }

    return {
      employeeNumber: item.employeeNumber,
      employeeName: firstValueInRange(rows[nameRow] ?? [], item.column, end),
      role: firstValueInRange(rows[roleRow] ?? [], item.column, end),
      start: item.column,
      end,
      columns
    };
  }).filter((group) => (
    group.columns.dailyGoal !== undefined || group.columns.dailySales !== undefined
  ));
}

function metricFromHeader(value: unknown): MetricKey | null {
  const header = normalizeText(value);
  if (header === "META DIARIA") return "dailyGoal";
  if (header.includes("VTAS TTLS SIN IVA")) return "dailySales";
  if (header === "TX TTLS") return "transactions";
  if (header === "UNID TTLS") return "pieces";
  if (header.includes("TX CAP CRM")) return "crmTransactions";
  // Venta por WhatsApp (ORKESTRA). Sin colisión con los headers Ttls:
  // se comparan de forma exacta o con "TTLS" incluido arriba.
  if (header.includes("ORKESTRA")) {
    if (header.includes("VTAS")) return "orkestraSales";
    if (header.includes("TX")) return "orkestraTransactions";
    if (header.includes("UNID")) return "orkestraPieces";
  }
  return null;
}

function detectDateColumn(headers: unknown[]) {
  const column = headers.findIndex((header) => normalizeText(header).includes("FECHA"));
  return column >= 0 ? column : 1;
}

function detectTrafficColumn(headers: unknown[]) {
  const column = headers.findIndex((header) => {
    const val = normalizeText(header);
    return val.includes("TRAFICO") || val === "AFLUENCIA" || val === "TRAF" || val === "FLUJO";
  });
  return column >= 0 ? column : null;
}

function findRowDate(row: unknown[], preferredColumn: number, employeeStart: number) {
  const preferred = parseExcelDate(row[preferredColumn]);
  if (preferred) return preferred;
  for (let column = 0; column < employeeStart; column += 1) {
    const date = parseExcelDate(row[column]);
    if (date) return date;
  }
  return null;
}

function parseExcelDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return validUtcDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? validUtcDate(parsed.y, parsed.m, parsed.d) : null;
  }
  const match = cleanCell(value).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if (!match) return null;
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  return validUtcDate(year, Number(match[2]), Number(match[1]));
}

function validUtcDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function employeeNumberCell(value: unknown) {
  const normalized = typeof value === "number" && Number.isFinite(value)
    ? String(Math.trunc(value))
    : cleanCell(value).replace(/\.0+$/, "").replace(/\s+/g, "");
  return /^\d+$/.test(normalized) ? normalized : "";
}

function firstValueInRange(row: unknown[], start: number, end: number) {
  for (let column = start; column < end; column += 1) {
    const value = cleanCell(row[column]);
    if (value) return value;
  }
  return "";
}

function numericCell(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = cleanCell(value).replace(/[$,%\s]/g, "").replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function integerCell(value: unknown) {
  return Math.max(0, Math.round(numericCell(value)));
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? round(numerator / denominator) : 0;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function deduplicate(records: ParsedKpiRecord[]) {
  const unique = new Map<string, ParsedKpiRecord>();
  for (const record of records) unique.set(`${record.employeeNumber}:${record.date.toISOString()}`, record);
  return Array.from(unique.values());
}

function cleanCell(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim().replace(/\s+/g, " ");
}

function normalizeText(value: unknown) {
  return cleanCell(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[´']/g, "").toUpperCase();
}
