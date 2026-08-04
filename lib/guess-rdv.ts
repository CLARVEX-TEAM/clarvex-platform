import * as XLSX from "@/lib/spreadsheet";
import type { KpiParseResult, ParsedKpiRecord, RdvWeekRange } from "@/lib/kpi-parser";
import { reconstructRdvWeek } from "@/lib/rdv-week";
import type { Role } from "@/lib/types";

/**
 * Lectura del RDV de GUESS, que es un archivo DISTINTO del RDV histórico.
 *
 * Nada coincide con el de siempre: la hoja de datos se llama «Captura» y no
 * «Diario de ventas», los bloques por persona son de 4 columnas en vez de 11,
 * y las cabeceras están en la fila 11. Además trae dentro su propio tabulador
 * de comisiones, cosa que el RDV viejo nunca tuvo.
 *
 * Por eso NO se intenta adaptar el parser existente: son dos formatos, y
 * mezclarlos convertiría el que ya funciona en un nido de condicionales.
 */

export const GUESS_DATA_SHEET = "Captura";
export const GUESS_TABULADOR_SHEET = "Tabulador";

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

function rowsOf(workbook: XLSX.WorkBook, sheetName: string): unknown[][] | null {
  const name = workbook.SheetNames.find((candidate) => normalize(candidate) === normalize(sheetName));
  if (!name) return null;
  return XLSX.utils.sheet_to_json(workbook.Sheets[name], {
    header: 1,
    blankrows: true,
    defval: null,
    raw: true
  }) as unknown[][];
}

/**
 * ¿Es un RDV de GUESS?
 *
 * Se decide por la FORMA del archivo, no por un ajuste que alguien tenga que
 * marcar al vincular la fuente. Los archivos del RDV histórico no tienen estas
 * dos hojas, así que no hay manera de que entren por aquí — y nadie tiene que
 * acordarse de configurar nada.
 */
export function isGuessRdvWorkbook(workbook: XLSX.WorkBook): boolean {
  const names = workbook.SheetNames.map(normalize);
  return names.includes(normalize(GUESS_DATA_SHEET)) && names.includes(normalize(GUESS_TABULADOR_SHEET));
}

export type GuessTabuladorBracket = {
  minAchievement: number;
  maxAchievement: number | null;
  kind: "FIXED" | "PERCENT";
  /** Importe en pesos si es fijo; porcentaje (1.611 = 1.611 %) si no. */
  value: number;
};

export type GuessTabulador = {
  /** Zona del tabulador: "D", "E"… Sale del encabezado de la hoja. */
  tier: string | null;
  /** Temporada que cubre el archivo: "LS (Ene-Oct)" o similar. */
  season: string | null;
  /** true si la temporada declarada es la baja (LS). */
  lowSeason: boolean;
  rows: Array<{ role: Role; brackets: GuessTabuladorBracket[] }>;
};

const ROLE_BY_LABEL: Record<string, Role> = {
  GERENTE: "GERENTE",
  SUBGERENTE: "SUBGERENTE",
  VENDEDOR: "ASESOR"
};

/** Convierte "80-85" o "100-114.99" en sus límites. "115+" no tiene tope. */
function parseBracketLabel(label: string): { min: number; max: number | null } | null {
  const clean = label.replace(/%/g, "").trim();
  if (/^\d+(\.\d+)?\+$/.test(clean)) return { min: Number.parseFloat(clean), max: null };
  const match = clean.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const min = Number.parseFloat(match[1]!);
  const max = Number.parseFloat(match[2]!);
  // El archivo escribe los tramos como "80-85", pero el corte real es 84.99:
  // 85 pertenece ya al escalón siguiente. Sin este ajuste, quien esté
  // exactamente en 85 % casaría con dos escalones.
  return { min, max: max >= 100 && max < 115 ? 114.99 : max - 0.01 };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[$,%\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Lee el tabulador de comisiones que el propio RDV trae dentro.
 *
 * Que venga en el archivo es la diferencia entre que cada tienda teclee 30
 * importes a mano —con lo que eso invita a un dedazo en un dato de nómina— y
 * que se lean solos y siempre cuadrados con lo que central publicó.
 *
 * Las secciones se localizan por su TEXTO, no por número de fila: el archivo lo
 * genera central y basta con que inserten una fila para descuadrar cualquier
 * posición fija.
 */
export function parseGuessTabulador(workbook: XLSX.WorkBook): GuessTabulador | null {
  const rows = rowsOf(workbook, GUESS_TABULADOR_SHEET);
  if (!rows) return null;

  const header = rows.slice(0, 4).map((row) => (row ?? []).map((cell) => String(cell ?? "")).join(" ")).join(" ");
  const tierMatch = header.match(/ZONA\s+([A-Z])/i);
  const seasonMatch = header.match(/\b(LS|HS)\s*\(([^)]+)\)/i);

  // Sección de importes fijos: la fila de cabecera lleva Bracket + los puestos.
  const fixedHeader = rows.findIndex((row) => {
    const cells = (row ?? []).map(normalize);
    return cells.includes("BRACKET") && cells.includes("GERENTE") && cells.includes("VENDEDOR");
  });
  // Sección de porcentajes: cabecera con "ROL" y los dos tramos.
  const percentHeader = rows.findIndex((row) => {
    const cells = (row ?? []).map(normalize);
    return cells.includes("ROL") && cells.some((cell) => cell.startsWith("100-"));
  });
  if (fixedHeader < 0 || percentHeader < 0) return null;

  const roleColumn: Record<Role, number> = { GERENTE: -1, SUBGERENTE: -1, ASESOR: -1, REGIONAL: -1 };
  (rows[fixedHeader] ?? []).forEach((cell, index) => {
    const role = ROLE_BY_LABEL[normalize(cell)];
    if (role) roleColumn[role] = index;
  });

  const brackets: Record<Role, GuessTabuladorBracket[]> = { GERENTE: [], SUBGERENTE: [], ASESOR: [], REGIONAL: [] };

  // Importes fijos: se leen hasta toparse con una fila sin tramo reconocible.
  for (let index = fixedHeader + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const range = parseBracketLabel(String(row[0] ?? ""));
    if (!range) {
      if (index > fixedHeader + 1) break;
      continue;
    }
    for (const role of ["GERENTE", "SUBGERENTE", "ASESOR"] as const) {
      const column = roleColumn[role];
      const amount = column >= 0 ? toNumber(row[column]) : null;
      if (amount === null) continue;
      brackets[role].push({ minAchievement: range.min, maxAchievement: range.max, kind: "FIXED", value: amount });
    }
  }

  // Porcentajes: una fila por puesto, con los dos tramos en columnas.
  const percentRanges = (rows[percentHeader] ?? [])
    .map((cell, index) => ({ index, range: parseBracketLabel(String(cell ?? "")) }))
    .filter((entry) => entry.range !== null);

  for (let index = percentHeader + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const role = ROLE_BY_LABEL[normalize(row[0])];
    if (!role) {
      if (index > percentHeader + 1) break;
      continue;
    }
    for (const { index: column, range } of percentRanges) {
      const raw = toNumber(row[column]);
      if (raw === null) continue;
      // El archivo guarda 0.01611, no 1.611. Confundirlos son dos órdenes de
      // magnitud en un pago, así que se normaliza a porcentaje explícito.
      const percent = raw < 1 ? raw * 100 : raw;
      brackets[role].push({ minAchievement: range!.min, maxAchievement: range!.max, kind: "PERCENT", value: Math.round(percent * 1000) / 1000 });
    }
  }

  const result: GuessTabulador = {
    tier: tierMatch ? tierMatch[1]!.toUpperCase() : null,
    season: seasonMatch ? `${seasonMatch[1]!.toUpperCase()} (${seasonMatch[2]!.trim()})` : null,
    lowSeason: seasonMatch ? seasonMatch[1]!.toUpperCase() === "LS" : true,
    rows: (["GERENTE", "SUBGERENTE", "ASESOR"] as const)
      .map((role) => ({ role: role as Role, brackets: brackets[role].sort((a, b) => a.minAchievement - b.minAchievement) }))
      .filter((entry) => entry.brackets.length > 0)
  };

  return result.rows.length > 0 ? result : null;
}

export type GuessRdvHeader = {
  brand: string | null;
  storeName: string | null;
  zone: string | null;
  season: string | null;
  month: string | null;
  /** Meta mensual de TIENDA. Viene explícita: no se suma de las personas. */
  storeGoal: number | null;
};

/**
 * Cabecera de la hoja «Captura»: marca, tienda, zona, temporada y meta de mes.
 *
 * La meta de tienda importa especialmente porque este RDV **no trae bloque de
 * TOTALES**. Gerente y subgerente se miden contra la meta de tienda, así que si
 * se sumaran las metas individuales el alcance saldría mal.
 */
export function parseGuessHeader(workbook: XLSX.WorkBook): GuessRdvHeader | null {
  const rows = rowsOf(workbook, GUESS_DATA_SHEET);
  if (!rows) return null;

  const find = (label: string): unknown => {
    for (const row of rows.slice(0, 8)) {
      const cells = row ?? [];
      for (let index = 0; index < cells.length; index += 1) {
        if (normalize(cells[index]).startsWith(normalize(label))) return cells[index + 1] ?? null;
      }
    }
    return null;
  };

  const text = (value: unknown) => {
    const raw = String(value ?? "").trim();
    return raw ? raw : null;
  };

  return {
    brand: text(find("MARCA")),
    storeName: text(find("TIENDA")),
    zone: text(find("ZONA")),
    season: text(find("TEMPORADA")),
    month: text(find("MES")),
    storeGoal: toNumber(find("META MES TIENDA"))
  };
}

const MONTH_NAMES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

/** El número de empleado puede venir como número o como texto. */
function employeeNumberCell(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === "string") {
    const clean = value.trim();
    return /^[A-Za-z0-9-]{3,}$/.test(clean) ? clean : null;
  }
  return null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Se normaliza a medianoche UTC: la hora que traiga la celda no aporta nada
    // y podría desplazar el día al agrupar por semana.
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)) : null;
  }
  return null;
}

/** Divide sin reventar cuando el divisor es cero. */
function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Convierte la hoja «Captura» en el mismo resultado que produce el parser
 * histórico, para que todo lo que hay aguas abajo —emparejar empleados, guardar
 * KPIs, reconstruir semanas— siga funcionando sin enterarse de que el archivo
 * era otro.
 *
 * Dos diferencias que este RDV impone, y que no son un descuido:
 *
 * - **No hay tráfico.** No existe la columna, así que la conversión queda en
 *   `null`. Es lo correcto: no hay dato, y un cero diría que nadie compró.
 * - **No hay bloque de TOTALES.** La venta de tienda se suma de las personas,
 *   pero la META de tienda NO: viene explícita en la cabecera. Sumar las metas
 *   individuales daría otro número, y gerencia se mide contra esa meta.
 */
export function parseGuessCaptura(workbook: XLSX.WorkBook): KpiParseResult {
  const rows = rowsOf(workbook, GUESS_DATA_SHEET);
  if (!rows) throw new Error("No se encontro la hoja Captura del RDV de GUESS.");

  const headerRow = rows.findIndex((row) => {
    const cells = (row ?? []).map(normalize);
    return cells.some((cell) => cell === "META DIA") && cells.some((cell) => cell.startsWith("VENTA SIN IVA"));
  });
  if (headerRow < 3) throw new Error("La hoja Captura no trae el encabezado esperado (META dia / Venta SIN IVA).");

  const headers = rows[headerRow] ?? [];
  const employeeRow = rows[headerRow - 2] ?? [];
  const nameRow = rows[headerRow - 1] ?? [];
  const roleRow = rows[headerRow - 3] ?? [];

  const dateColumn = headers.findIndex((cell) => normalize(cell) === "FECHA");
  if (dateColumn < 0) throw new Error("La hoja Captura no tiene columna Fecha.");

  // Cada persona ocupa un bloque contiguo. Se delimita por el cambio de número
  // de empleado, no por una anchura fija: si central añadiera una columna al
  // bloque, esto lo aguanta.
  type Group = { employeeNumber: string; employeeName: string; role: string; goal: number; sales: number; tx: number; pieces: number };
  const groups: Group[] = [];
  let current: string | null = null;
  for (let column = 0; column < headers.length; column += 1) {
    const employeeNumber = employeeNumberCell(employeeRow[column]);
    if (!employeeNumber || employeeNumber === current) continue;
    current = employeeNumber;
    let end = headers.length;
    for (let next = column + 1; next < headers.length; next += 1) {
      const candidate = employeeNumberCell(employeeRow[next]);
      if (candidate && candidate !== employeeNumber) { end = next; break; }
    }
    const find = (label: string) => {
      for (let index = column; index < end; index += 1) {
        if (normalize(headers[index]).startsWith(normalize(label))) return index;
      }
      return -1;
    };
    const goal = find("META DIA");
    if (goal < 0) continue;
    groups.push({
      employeeNumber,
      employeeName: String(nameRow[column] ?? "").trim(),
      role: String(roleRow[column] ?? "").trim(),
      goal,
      sales: find("VENTA SIN IVA"),
      tx: find("# TX"),
      pieces: find("# UNIDADES")
    });
  }
  if (groups.length === 0) throw new Error("No se detectaron colaboradores en la hoja Captura.");

  const header = parseGuessHeader(workbook);
  const records: ParsedKpiRecord[] = [];
  const weeks = new Map<number, Date[]>();
  const employeeTtlsGoals: Record<string, number> = {};
  let rowsRead = 0;
  let ignoredRows = 0;
  let ttlsSales = 0;
  let ttlsTransactions = 0;
  let ttlsPieces = 0;

  for (let index = headerRow + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const date = asDate(row[dateColumn]);
    if (!date) { ignoredRows += 1; continue; }
    rowsRead += 1;

    // La semana se deriva de la FECHA, no de la columna «Sem» del archivo: esa
    // numera 1..5 dentro del mes y chocaría entre meses distintos.
    const week = reconstructRdvWeek(date);
    if (!weeks.has(week.weekNumber)) weeks.set(week.weekNumber, []);
    weeks.get(week.weekNumber)!.push(date);

    for (const group of groups) {
      const num = (column: number) => {
        const value = column >= 0 ? row[column] : null;
        return typeof value === "number" && Number.isFinite(value) ? value : 0;
      };
      const dailyGoal = num(group.goal);
      const dailySales = num(group.sales);
      const transactions = num(group.tx);
      const pieces = num(group.pieces);
      if (dailyGoal === 0 && dailySales === 0 && transactions === 0 && pieces === 0) continue;

      employeeTtlsGoals[group.employeeNumber] = (employeeTtlsGoals[group.employeeNumber] ?? 0) + dailyGoal;
      ttlsSales += dailySales;
      ttlsTransactions += transactions;
      ttlsPieces += pieces;

      records.push({
        employeeNumber: group.employeeNumber,
        employeeName: group.employeeName,
        role: group.role,
        date,
        weekNumber: week.weekNumber,
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        dailyGoal,
        dailySales,
        transactions,
        pieces,
        crmTransactions: 0,
        orkestraSales: 0,
        orkestraTransactions: 0,
        orkestraPieces: 0,
        traffic: null,
        upt: ratio(pieces, transactions),
        aur: ratio(dailySales, pieces),
        ept: ratio(dailySales, transactions),
        // Sin tráfico no hay conversión. Un cero mentiría.
        conversion: null,
        achievement: ratio(dailySales, dailyGoal) * 100
      });
    }
  }

  const weeksDetected: RdvWeekRange[] = [...weeks.entries()]
    .map(([weekNumber, dates]) => ({
      weekNumber,
      weekStart: new Date(Math.min(...dates.map((date) => date.getTime()))),
      weekEnd: new Date(Math.max(...dates.map((date) => date.getTime())))
    }))
    .sort((left, right) => left.weekStart.getTime() - right.weekStart.getTime());

  const monthIndex = MONTH_NAMES.indexOf(normalize(header?.month));
  const firstDate = records[0]?.date ?? weeksDetected[0]?.weekStart ?? new Date();
  const year = monthIndex >= 0 && firstDate.getUTCMonth() > monthIndex ? firstDate.getUTCFullYear() + 1 : firstDate.getUTCFullYear();
  const resolvedMonth = monthIndex >= 0 ? monthIndex : firstDate.getUTCMonth();
  const monthLabel = MONTH_NAMES[resolvedMonth] ?? "";

  return {
    sheetUsed: GUESS_DATA_SHEET,
    records,
    employeeNumbers: groups.map((group) => group.employeeNumber),
    weeksDetected,
    retailMonthLabel: `${monthLabel.charAt(0)}${monthLabel.slice(1).toLowerCase()} ${year}`,
    retailMonthStart: new Date(Date.UTC(year, resolvedMonth, 1)),
    retailMonthEnd: new Date(Date.UTC(year, resolvedMonth + 1, 0)),
    crmTransactionsTotal: 0,
    totalSalesImported: ttlsSales,
    totalGoalImported: Object.values(employeeTtlsGoals).reduce((sum, value) => sum + value, 0),
    rowsRead,
    ignoredRows,
    // Este RDV no trae tráfico ni bloque de totales.
    ttlsTraffic: null,
    // La meta de TIENDA sale de la cabecera, no de sumar las individuales.
    ttlsMeta: header?.storeGoal ?? 0,
    ttlsSales,
    ttlsTransactions,
    ttlsPieces,
    employeeTtlsGoals,
    // GUESS no usa mínimos: su alcance se mide contra la meta.
    employeeCommissionMinimums: {},
    storeTtlsCommissionMinimum: null
  };
}
