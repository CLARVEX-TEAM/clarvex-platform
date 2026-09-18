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

/**
 * Etiqueta en español de cada estado, la misma que trae el archivo de horarios.
 * Se deriva de `statusMap` en vez de escribirse aparte para que una fila
 * capturada a mano y una importada del Excel guarden el MISMO `statusRaw`: si
 * divergen, cualquier consulta que agrupe por ese texto parte el resultado en
 * dos sin avisar.
 */
export const SCHEDULE_STATUS_LABELS = Object.fromEntries(
  Object.entries(statusMap).map(([label, status]) => [status, label])
) as Record<ParsedScheduleStatus, string>;

/**
 * Nombre corto del día ("Dom", "Lun"…) tal y como lo guarda el importador en
 * `Schedule.day`. Se calcula desde la MISMA tabla que usa el parser.
 */
export function shortDayFromDate(date: Date): string {
  return dayDefinitions[date.getUTCDay()].short;
}

/** Lo que se va juntando mientras se recorre una hoja o un pegado. */
type Acumulador = {
  records: ParsedSchedule[];
  weeks: Set<string>;
  employeeNumbers: Set<string>;
  unknownValues: Record<string, number>;
  problemas: string[];
};

function nuevoAcumulador(): Acumulador {
  return { records: [], weeks: new Set(), employeeNumbers: new Set(), unknownValues: {}, problemas: [] };
}

export function parseScheduleWorkbook(workbook: XLSX.WorkBook): ScheduleParseResult {
  const acc = nuevoAcumulador();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: true,
      defval: null,
      raw: true
    }) as unknown[][];
    recorrerFilas(rows, sheetName, acc);
  }

  return cerrar(acc);
}

function cerrar(acc: Acumulador): ScheduleParseResult {
  return {
    records: deduplicateRecords(acc.records),
    weeks: Array.from(acc.weeks),
    employeeNumbers: Array.from(acc.employeeNumbers),
    unknownValues: acc.unknownValues
  };
}

/**
 * Recorre una matriz de celdas --una hoja del Excel, o un bloque pegado-- y
 * saca de ahí los días de cada persona.
 *
 * ⚠️ **La misma función para las dos entradas, a propósito.** Encontrar el
 * encabezado, emparejar la fila de fechas, mapear los estados y leer un rango
 * de horas es lo difícil y ya estaba probado contra el archivo real. Escribir
 * un segundo lector para el pegado habría creado dos verdades sobre la misma
 * hoja, que es como se separan sin que nadie lo note.
 */
function recorrerFilas(rows: unknown[][], sheetName: string, acc: Acumulador): void {
  const { records, weeks, employeeNumbers, unknownValues } = acc;
  {
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

      /*
       * ⚠️ **La hoja se verifica a sí misma: el rótulo del día contra la fecha.**
       *
       * En el archivo las fechas son números de serie y no hay ambigüedad, pero
       * PEGADO llegan como texto --«04/10/2026»-- y ahí día/mes y mes/día son
       * las dos lecturas posibles. Con la primera sale DOMINGO, LUNES, MARTES…
       * igual que los rótulos; con la segunda, VIERNES, DOMINGO, MIÉRCOLES.
       *
       * Así que la propia hoja dice cuál es la buena, y un pegado que no cuadre
       * se reporta en vez de adivinarse. Un mes entero de descansos corridos un
       * día no se ve al revisarlo: se ve cuando alguien no viene a trabajar.
       */
      for (const day of datedDays) {
        const nombreDelDia = dayDefinitions[day.date.getUTCDay()]?.normalized;
        if (nombreDelDia !== day.normalized) {
          acc.problemas.push(
            `${sheetName}: la columna ${day.normalized} trae ${formatDateKey(day.date)}, que cae en ${nombreDelDia}. ` +
              "Revisa que las fechas estén como día/mes."
          );
        }
      }

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

          const leido = leerCelda(statusRaw);
          if (!leido) {
            unknownValues[statusRaw] = (unknownValues[statusRaw] ?? 0) + 1;
            continue;
          }
          const { status } = leido;
          const shift = leido.start ? { start: leido.start, end: leido.end ?? "" } : null;

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
}

/**
 * Lee el bloque que se copia de Excel y se pega en Retool.
 *
 * Al copiar, Excel entrega las celdas separadas por TABULADOR y las filas por
 * salto de línea. Se arma la misma matriz que produce el archivo y se recorre
 * con la misma función.
 *
 * ⚠️ Devuelve además `problemas`: fechas que no cuadran con su rótulo y valores
 * de celda que no se reconocieron. Quien llama decide si son bloqueantes —lo
 * son— pero el parser no decide por su cuenta qué se guarda.
 */
export function parseSchedulePaste(texto: string): ScheduleParseResult & { problemas: string[] } {
  const acc = nuevoAcumulador();
  const filas = texto
    .replace(/\r\n?/g, "\n")
    .split("\n")
    // Una fila enteramente vacía separa semanas en la hoja; se conserva porque
    // `recorrerFilas` corta bloques por encabezado, no por huecos.
    .map((linea) => linea.split("\t").map((celda) => (celda.trim() === "" ? null : celda)));

  recorrerFilas(filas, "pegado", acc);

  const resultado = cerrar(acc);
  const desconocidos = Object.keys(acc.unknownValues);
  if (desconocidos.length > 0) {
    acc.problemas.push(`No se reconocieron estos valores de celda: ${desconocidos.join(", ")}.`);
  }
  if (resultado.records.length === 0 && acc.problemas.length === 0) {
    acc.problemas.push("No encontré ninguna semana en lo pegado. Copia desde la fila de DOMINGO…SÁBADO hacia abajo.");
  }
  return { ...resultado, problemas: acc.problemas };
}

// Detecta un rango de horas en la celda: "10:30-19:00", "10:30 a 7", "12-9"…
// Convención retail: si la hora de salida es menor o igual a la de entrada, se
// asume PM (entra 12, sale 9 → 21:00). Devuelve horas normalizadas "HH:MM".
/**
 * Qué dice una celda del horario.
 *
 * Tres formas, y las tres se usan en la hoja de la tienda:
 *
 *   `LABORANDO`              → trabaja, con el horario estándar
 *   `10:30-19:00`            → trabaja, con esa hora
 *   `LABORANDO 12:00-21:00`  → trabaja, con esa hora, sin perder la palabra
 *
 * ⚠️ **La tercera es la que pidió la tienda** (18 de septiembre de 2026): su
 * hoja no tiene horas, y escribirlas solo en los turnos que se salen del
 * estándar es lo que evita inventar un 10:30 para todo el mundo. Antes había
 * que BORRAR la palabra y dejar solo el rango, y una hoja que se lee distinto
 * según lo que alguien recuerde borrar es una hoja que se va a leer mal.
 *
 * ⚠️ Un estado que NO es de trabajo se queda sin horas aunque la celda las
 * traiga: un descanso con horario no significa nada, y guardarlas haría que la
 * asistencia lo midiera como si hubiera venido.
 */
function leerCelda(bruto: string): { status: ParsedScheduleStatus; start: string | null; end: string | null } | null {
  const soloRango = parseTimeRange(bruto);
  if (soloRango) return { status: "WORKING", start: soloRango.start, end: soloRango.end };

  const conPalabra = bruto.match(/^(.*?)[\s,;]+(\d{1,2}(?::\d{2})?\s*(?:-|–|—|a|to)\s*\d{1,2}(?::\d{2})?)$/i);
  if (conPalabra?.[1] && conPalabra[2]) {
    const status = statusMap[normalizeText(conPalabra[1])];
    const rango = parseTimeRange(conPalabra[2]);
    if (status && rango) {
      const trabaja = status === "WORKING" || status === "INVENTORY";
      return { status, start: trabaja ? rango.start : null, end: trabaja ? rango.end : null };
    }
  }

  const status = statusMap[normalizeText(bruto)];
  return status ? { status, start: null, end: null } : null;
}

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
