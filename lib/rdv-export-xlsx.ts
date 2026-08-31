import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { decodeSyncLogMessage, type KpiSyncMetrics } from "@/lib/data-source";
import { buildRetailMonths, periodDateKey, selectRetailMonth } from "@/lib/kpi-period";
import {
  columnIndex,
  columnLetter,
  mapSheets,
  readPart,
  writeCell
} from "@/lib/kardex-xlsx";
import { reconstructRdvWeek, type RdvWeek } from "@/lib/rdv-week";
import { PERSON_WHERE } from "@/lib/store-people";
import type { Role } from "@/lib/types";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "rdv.xlsx");
const DAY_MS = 86_400_000;
const MAX_WEEKS = 5;
const DAYS_PER_WEEK = 7;
const DAY_ROW_START = 10;
const MONTH_TOTAL_ROW = 45;
const PERSON_BLOCKS = 15;
const PERSON_BLOCK_WIDTH = 11;
const FIRST_PERSON_COLUMN = columnIndex("D");
const FIRST_TOTAL_COLUMN = columnIndex("FM");
const LAST_TOTAL_COLUMN = columnIndex("FX");
const TEAM_ROLES = ["GERENTE", "SUBGERENTE", "ASESOR"] as const;
const WEEKDAY_LABELS = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"];

type TeamRole = (typeof TEAM_ROLES)[number];

export type RdvPerson = {
  userId: string;
  name: string;
  role: TeamRole;
  employeeNumber: string;
  employeeNumbers?: string[];
};

export type RdvKpiCell = {
  userId: string;
  date: string;
  dailyGoal: number;
  dailySales: number;
  transactions: number;
  pieces: number;
  crmTransactions: number | null;
  orkestraSales: number | null;
  orkestraTransactions: number | null;
  orkestraPieces: number | null;
};

export type RdvDay = {
  date: string;
  weekNumber: number;
  traffic: number | null;
  kpis: RdvKpiCell[];
};

export type RdvExportState = {
  store: { id: string; name: string };
  document: {
    brand: string | null;
    center: string | null;
    classification: string | null;
    crmObjective: number;
    monthName: string;
  };
  retailMonth: {
    label: string;
    start: string;
    end: string;
    weeks: Array<{ weekNumber: number; weekStart: string; weekEnd: string }>;
  };
  people: RdvPerson[];
  days: RdvDay[];
};

export type RdvExportOptions = {
  templatePath?: string;
  brand?: string | null;
  center?: string | null;
  classification?: string | null;
  crmObjective?: number | null;
};

export async function exportRdvWorkbook(storeId: string, selectedDate: Date, options: RdvExportOptions = {}) {
  const state = await getRdvExportState(storeId, selectedDate, options);
  const buffer = await buildRdvWorkbook(state, options.templatePath);
  return { buffer, filename: buildRdvFilename(state), state };
}

export async function getRdvExportState(
  storeId: string,
  selectedDate: Date,
  options: Omit<RdvExportOptions, "templatePath"> = {}
): Promise<RdvExportState> {
  const { prisma } = await import("@/lib/prisma");
  const retailMonth = retailMonthFor(selectedDate);
  if (!retailMonth) throw new Error("No se pudo determinar el mes RDV.");
  if (retailMonth.weeks.length > MAX_WEEKS) {
    throw new Error(`El formato RDV admite máximo ${MAX_WEEKS} semanas y este periodo trae ${retailMonth.weeks.length}.`);
  }

  const [store, activeUsers, kpiRows, latestKpiSource] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { storeId, ...PERSON_WHERE, role: { in: [...TEAM_ROLES] } },
      select: {
        id: true,
        name: true,
        role: true,
        employeeNumber: true,
        employeeNumberAliases: { select: { employeeNumber: true } }
      }
    }),
    prisma.kpi.findMany({
      where: {
        storeId,
        date: { gte: retailMonth.start, lte: retailMonth.end },
        user: { checklistOnly: false, role: { in: [...TEAM_ROLES] } }
      },
      orderBy: [{ date: "asc" }, { user: { name: "asc" } }],
      select: {
        userId: true,
        date: true,
        dailyGoal: true,
        dailySales: true,
        transactions: true,
        pieces: true,
        traffic: true,
        crmTransactions: true,
        orkestraSales: true,
        orkestraTransactions: true,
        orkestraPieces: true,
        user: {
          select: {
            id: true,
            name: true,
            role: true,
            employeeNumber: true,
            employeeNumberAliases: { select: { employeeNumber: true } }
          }
        }
      }
    }),
    prisma.dataSource.findFirst({
      where: { storeId, type: "KPIS" },
      include: { syncLogs: { where: { status: "SUCCESS" }, orderBy: { createdAt: "desc" }, take: 1 } }
    })
  ]);
  if (!store) throw new Error("Tienda no encontrada.");

  const peopleById = new Map<string, RdvPerson>();
  for (const user of activeUsers) peopleById.set(user.id, toRdvPerson(user));
  for (const row of kpiRows) {
    if (!peopleById.has(row.user.id)) peopleById.set(row.user.id, toRdvPerson(row.user));
  }

  const employeeOrder = latestEmployeeOrder(latestKpiSource?.syncLogs[0]?.message);
  const people = sortRdvPeople(Array.from(peopleById.values()), employeeOrder);
  if (people.length > PERSON_BLOCKS) {
    throw new Error(`El formato RDV admite máximo ${PERSON_BLOCKS} colaboradores y esta tienda tiene ${people.length}.`);
  }

  const trafficByDay = new Map<string, number>();
  for (const row of kpiRows) {
    if (!row.traffic) continue;
    const key = periodDateKey(row.date);
    trafficByDay.set(key, Math.max(trafficByDay.get(key) ?? 0, row.traffic));
  }

  const kpisByDay = new Map<string, RdvKpiCell[]>();
  for (const row of kpiRows) {
    const key = periodDateKey(row.date);
    const item: RdvKpiCell = {
      userId: row.userId,
      date: key,
      dailyGoal: number(row.dailyGoal),
      dailySales: number(row.dailySales),
      transactions: row.transactions,
      pieces: row.pieces,
      crmTransactions: row.crmTransactions,
      orkestraSales: nullableNumber(row.orkestraSales),
      orkestraTransactions: row.orkestraTransactions,
      orkestraPieces: row.orkestraPieces
    };
    kpisByDay.set(key, [...(kpisByDay.get(key) ?? []), item]);
  }

  const presentation = storePresentation(store.name);
  const weeks = retailMonth.weeks.map((week) => ({
    weekNumber: week.weekNumber,
    weekStart: periodDateKey(week.weekStart),
    weekEnd: periodDateKey(week.weekEnd)
  }));

  return {
    store,
    document: {
      brand: cleanOption(options.brand) ?? presentation.brand,
      center: cleanOption(options.center) ?? presentation.center,
      classification: cleanOption(options.classification),
      crmObjective: options.crmObjective && options.crmObjective > 0 ? options.crmObjective : 1,
      monthName: monthName(retailMonth.label)
    },
    retailMonth: {
      label: retailMonth.label,
      start: periodDateKey(retailMonth.start),
      end: periodDateKey(retailMonth.end),
      weeks
    },
    people,
    days: daySlots(retailMonth.weeks).flatMap((slot) => {
      if (!slot) return [];
      const key = periodDateKey(slot.date);
      return [{
        date: key,
        weekNumber: slot.weekNumber,
        traffic: trafficByDay.get(key) ?? null,
        kpis: kpisByDay.get(key) ?? []
      }];
    })
  };
}

export async function buildRdvWorkbook(state: RdvExportState, templatePath = TEMPLATE_PATH): Promise<Buffer> {
  if (state.retailMonth.weeks.length > MAX_WEEKS) {
    throw new Error(`El formato RDV admite máximo ${MAX_WEEKS} semanas.`);
  }
  if (state.people.length > PERSON_BLOCKS) {
    throw new Error(`El formato RDV admite máximo ${PERSON_BLOCKS} colaboradores.`);
  }

  const zip = await JSZip.loadAsync(await fs.readFile(templatePath));
  const sheets = await mapSheets(zip);
  const sheetPath = requiredSheet(sheets, "Diario de ventas");
  let sheet = expandSharedFormulas(await readPart(zip, sheetPath));

  sheet = writeCell(sheet, "D1", state.document.brand);
  sheet = writeCell(sheet, "D2", state.document.center);
  sheet = writeCell(sheet, "D3", state.document.classification);
  sheet = writeCell(sheet, "D4", state.document.crmObjective);
  sheet = writeCell(sheet, "D5", state.document.monthName);

  // Cada quien en el bloque que su PUESTO tiene reservado, no en el siguiente
  // libre: las hojas de comisiones leen columnas fijas por puesto.
  const bloques = asignarBloques(state.people);
  const orderedPeople = bloques.filter((p): p is RdvPerson => p !== null);
  const kpisByPersonDay = new Map<string, RdvKpiCell>();
  for (const day of state.days) {
    for (const kpi of day.kpis) kpisByPersonDay.set(`${kpi.userId}:${day.date}`, kpi);
  }
  const daysByDate = new Map(state.days.map((day) => [day.date, day]));

  for (let index = 0; index < PERSON_BLOCKS; index += 1) {
    const person = bloques[index];
    const column = FIRST_PERSON_COLUMN + index * PERSON_BLOCK_WIDTH;
    sheet = writeCell(
      sheet,
      `${columnLetter(column)}6`,
      person ? roleLabel(person.role, bloques.slice(0, index + 1).filter((p): p is RdvPerson => p !== null)) : null
    );
    sheet = writeCell(sheet, `${columnLetter(column)}7`, person?.employeeNumber ?? null);
    sheet = writeCell(sheet, `${columnLetter(column)}8`, person?.name ?? null);
  }

  /*
   * ⚠️ La plantilla trae bloques de persona OCULTOS y hay que mostrarlos.
   *
   * El archivo corporativo llegó con las columnas 26-36 escondidas —el tercer
   * bloque— además de las 70-168, que son los bloques que sobran. Escribir
   * dentro de una columna oculta no la muestra: los datos quedan bien puestos y
   * **no se ven**. Pasó con Waira, que cae justo en el bloque 3: estaba en el
   * archivo, con su número y sus ventas, y parecía que el export la había
   * perdido.
   *
   * Solo se muestran los bloques que reciben a alguien. Los de más siguen
   * ocultos a propósito: son columnas vacías y enseñarlas ensucia el reporte.
   */
  bloques.forEach((person, index) => {
    if (!person) return;
    const desde = FIRST_PERSON_COLUMN + index * PERSON_BLOCK_WIDTH;
    sheet = mostrarColumnas(sheet, desde, desde + PERSON_BLOCK_WIDTH - 1);
  });

  const slots = daySlots(state.retailMonth.weeks.map((week) => ({
    weekNumber: week.weekNumber,
    weekStart: parseDay(week.weekStart),
    weekEnd: parseDay(week.weekEnd)
  })));

  slots.forEach((slot, index) => {
    const row = DAY_ROW_START + index;
    if (slot) {
      const dateKey = periodDateKey(slot.date);
      sheet = writeCell(sheet, `A${row}`, `Semana ${slot.weekNumber}`);
      sheet = writeCell(sheet, `B${row}`, WEEKDAY_LABELS[slot.date.getUTCDay()]);
      sheet = writeCell(sheet, `C${row}`, slot.date);
      const day = daysByDate.get(dateKey);
      sheet = writeCell(sheet, `FM${row}`, day?.traffic ?? null);
      for (let personIndex = 0; personIndex < PERSON_BLOCKS; personIndex += 1) {
        const person = bloques[personIndex];
        const column = FIRST_PERSON_COLUMN + personIndex * PERSON_BLOCK_WIDTH;
        const kpi = person ? kpisByPersonDay.get(`${person.userId}:${dateKey}`) : undefined;
        sheet = writePersonDay(sheet, row, column, kpi);
      }
    } else {
      sheet = writeCell(sheet, `A${row}`, null);
      sheet = writeCell(sheet, `B${row}`, null);
      sheet = writeCell(sheet, `C${row}`, null);
      sheet = writeCell(sheet, `FM${row}`, null);
      for (let personIndex = 0; personIndex < PERSON_BLOCKS; personIndex += 1) {
        const column = FIRST_PERSON_COLUMN + personIndex * PERSON_BLOCK_WIDTH;
        sheet = writePersonDay(sheet, row, column, undefined);
      }
    }
  });

  for (let index = 0; index < PERSON_BLOCKS; index += 1) {
    const column = FIRST_PERSON_COLUMN + index * PERSON_BLOCK_WIDTH;
    // Filas auxiliares de bonos/incidencias que la base no almacena para el RDV.
    for (const row of [46, 47, 48, 49, 50, 51, 52, 53, 54]) {
      sheet = writeCell(sheet, `${columnLetter(column)}${row}`, null);
    }
  }

  for (let column = FIRST_TOTAL_COLUMN; column <= LAST_TOTAL_COLUMN; column += 1) {
    const address = `${columnLetter(column)}${MONTH_TOTAL_ROW}`;
    // Las fórmulas mensuales se conservan; solo se eliminan resultados viejos.
    if (!hasFormula(sheet, address)) sheet = writeCell(sheet, address, null);
  }

  sheet = clearFormulaCaches(sheet);
  zip.file(sheetPath, sheet);
  for (const [name, pathName] of sheets.entries()) {
    if (name === "Diario de ventas") continue;
    const current = clearFormulaCaches(expandSharedFormulas(await readPart(zip, pathName)));
    zip.file(pathName, name === "Informe" ? clearStaticCells(current) : current);
  }

  zip.file("xl/workbook.xml", selectActiveSheet(forceFullRecalculation(await readPart(zip, "xl/workbook.xml")), 1));
  zip.file(sheetPath, selectWorksheet(await readPart(zip, sheetPath), true));
  await clearChartCaches(zip);
  await removeStaleCalculationParts(zip);
  await pruneUnusedSharedStrings(zip);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function writePersonDay(xml: string, row: number, startColumn: number, kpi: RdvKpiCell | undefined) {
  const values = [
    kpi?.dailyGoal ?? null,
    kpi?.dailySales ?? null,
    kpi?.transactions ?? null,
    kpi?.pieces ?? null,
    kpi?.crmTransactions ?? null,
    null,
    kpi?.orkestraSales ?? null,
    kpi?.orkestraTransactions ?? null,
    kpi?.orkestraPieces ?? null,
    null,
    null
  ];
  let next = xml;
  values.forEach((value, index) => {
    next = writeCell(next, `${columnLetter(startColumn + index)}${row}`, value);
  });
  return next;
}

export type RdvMonthOption = {
  /**
   * La FECHA DE INICIO del mes retail, no su `AAAA-MM`.
   *
   * ⚠️ Un mes retail puede empezar en el mes natural anterior --junio de 2026
   * arranca el 31 de mayo-- asi que agrupar por `AAAA-MM` juntaba mayo con
   * junio y agosto con septiembre, y el segundo de cada par desaparecia de la
   * lista sin avisar.
   */
  key: string;
  label: string;
  start: string;
  end: string;
  /** La fecha que hay que mandarle al export para pedir ESTE mes. */
  date: string;
  /** Cuántos días de ese mes tienen KPI capturado. */
  dias: number;
};

/**
 * Los meses RDV que se pueden exportar de una tienda.
 *
 * ⚠️ **La lista la arma el SERVIDOR y no la pantalla.** El mes retail no es el
 * natural —una semana que cruza de mes pertenece a uno o a otro según dónde
 * empiece— y calcularlo aparte crearía una segunda numeración que acabaría
 * separándose de la real. Es la misma razón por la que el número de semana se
 * lee de `Kpi.weekNumber` en vez de calcularse.
 *
 * Solo salen los meses que **tienen datos**: ofrecer un mes vacío es prometer
 * un archivo en blanco.
 */
export async function listRdvMonths(storeId: string): Promise<RdvMonthOption[]> {
  // ⚠️ Importado aqui dentro, como el resto del modulo: `lib/prisma` lanza al
  // cargarse fuera de la configuracion de integracion y eso dejaria este
  // archivo sin poder probarse.
  const { prisma } = await import("@/lib/prisma");

  const rango = await prisma.kpi.aggregate({
    where: { storeId },
    _min: { date: true },
    _max: { date: true }
  });
  if (!rango._min.date || !rango._max.date) return [];

  const meses = new Map<string, RdvMonthOption>();
  // Se recorre mes natural a mes natural y se le pregunta al calendario real a
  // qué mes RETAIL pertenece; así los límites salen de una sola fuente.
  let cursor = new Date(Date.UTC(rango._min.date.getUTCFullYear(), rango._min.date.getUTCMonth(), 15));
  const tope = new Date(Date.UTC(rango._max.date.getUTCFullYear(), rango._max.date.getUTCMonth(), 15));
  while (cursor <= tope) {
    const mes = retailMonthFor(cursor);
    // ⚠️ Un mes de más de cinco semanas no cabe en la plantilla. Se deja fuera
    // aquí en vez de ofrecerlo y fallar al descargarlo.
    if (mes && mes.weeks.length <= MAX_WEEKS) {
      const key = periodDateKey(mes.start);
      if (!meses.has(key)) {
        meses.set(key, {
          key,
          label: mes.label,
          start: periodDateKey(mes.start),
          end: periodDateKey(mes.end),
          date: periodDateKey(mes.start),
          dias: 0
        });
      }
    }
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 15));
  }

  // Cuántos días de cada mes tienen algo capturado, para no ofrecer vacíos.
  const dias = await prisma.kpi.findMany({
    where: { storeId },
    select: { date: true },
    distinct: ["date"]
  });
  for (const mes of meses.values()) {
    mes.dias = dias.filter((d) => {
      const k = periodDateKey(d.date);
      return k >= mes.start && k <= mes.end;
    }).length;
  }

  return [...meses.values()].filter((mes) => mes.dias > 0).sort((a, b) => (a.start < b.start ? 1 : -1));
}

function retailMonthFor(selectedDate: Date) {
  const firstOfMonth = new Date(Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), 1));
  const lastOfMonth = new Date(Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth() + 1, 0));
  const scanStart = new Date(firstOfMonth.getTime() - 21 * DAY_MS);
  const scanEnd = new Date(lastOfMonth.getTime() + 21 * DAY_MS);
  const weeks: RdvWeek[] = [];
  let cursor = reconstructRdvWeek(scanStart).weekStart;
  while (cursor <= scanEnd) {
    weeks.push(reconstructRdvWeek(cursor));
    cursor = new Date(cursor.getTime() + 7 * DAY_MS);
  }
  const month = selectRetailMonth(buildRetailMonths(weeks), selectedDate);
  if (!month) return null;
  const monthWeeks = weeks.filter((week) => week.weekStart >= month.start && week.weekEnd <= month.end);
  return { ...month, weeks: monthWeeks };
}

function daySlots(weeks: Array<{ weekNumber: number; weekStart: Date; weekEnd: Date }>) {
  const slots: Array<{ weekNumber: number; date: Date } | null> = [];
  for (const week of weeks) {
    for (let offset = 0; offset < DAYS_PER_WEEK; offset += 1) {
      slots.push({ weekNumber: week.weekNumber, date: new Date(week.weekStart.getTime() + offset * DAY_MS) });
    }
  }
  while (slots.length < MAX_WEEKS * DAYS_PER_WEEK) slots.push(null);
  if (slots.length > MAX_WEEKS * DAYS_PER_WEEK) throw new Error("El mes RDV no cabe en la plantilla.");
  return slots;
}

function toRdvPerson(user: {
  id: string;
  name: string;
  role: Role;
  employeeNumber: string;
  employeeNumberAliases?: Array<{ employeeNumber: string }>;
}): RdvPerson {
  if (!isTeamRole(user.role)) throw new Error(`Rol no soportado para RDV: ${user.role}.`);
  return {
    userId: user.id,
    name: user.name,
    role: user.role,
    employeeNumber: user.employeeNumber,
    employeeNumbers: [user.employeeNumber, ...(user.employeeNumberAliases ?? []).map((alias) => alias.employeeNumber)]
  };
}

function sortRdvPeople(people: RdvPerson[], employeeOrder: string[] | null) {
  const orderByUser = new Map<string, number>();
  if (employeeOrder?.length) {
    for (const person of people) {
      const index = (person.employeeNumbers ?? [person.employeeNumber])
        .map((numberValue) => employeeOrder.indexOf(numberValue))
        .filter((indexValue) => indexValue >= 0)
        .sort((left, right) => left - right)[0];
      if (index !== undefined) orderByUser.set(person.userId, index);
    }
  }
  const roleOrder: Record<TeamRole, number> = { GERENTE: 0, SUBGERENTE: 1, ASESOR: 2 };
  return [...people].sort((left, right) => {
    const leftOrder = orderByUser.get(left.userId);
    const rightOrder = orderByUser.get(right.userId);
    if (leftOrder !== undefined || rightOrder !== undefined) {
      return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
    }
    return roleOrder[left.role] - roleOrder[right.role] || left.name.localeCompare(right.name, "es");
  });
}

function latestEmployeeOrder(message: string | undefined) {
  if (!message) return null;
  const details = decodeSyncLogMessage(message).details;
  const order = (details as Partial<KpiSyncMetrics> | null)?.employeeOrder;
  return Array.isArray(order) && order.every((value) => typeof value === "string") ? order : null;
}

/** Cuántos bloques reserva la plantilla para cada puesto, y en qué orden. */
const BLOQUES_POR_PUESTO: ReadonlyArray<TeamRole> = [
  "GERENTE",
  "SUBGERENTE",
  "SUBGERENTE",
  ...Array<TeamRole>(PERSON_BLOCKS - 3).fill("ASESOR")
];

/**
 * Coloca a cada persona en el bloque que su PUESTO tiene reservado.
 *
 * ⚠️ **No se reparten en orden de llegada, y esto es dinero.** La plantilla
 * corporativa tiene los puestos cableados por posición: el bloque 1 es GERENTE,
 * el 2 y el 3 son SUBGERENTE 1 y 2, y del 4 en adelante son VENDEDOR. Las hojas
 * `KPIs x Colaborador` y `COMISIONES` leen esas columnas fijas y aplican el
 * porcentaje del puesto que corresponde a la fila, no al de la persona.
 *
 * Empaquetando a la gente seguida, una tienda sin segundo subgerente metía a su
 * primera asesora en el bloque 3 —el de SUBGERENTE 2— y el Excel le calculaba
 * **0.93/1.16/1.39 sobre la venta de TIENDA** en vez de 1.53/1.91/2.29 sobre la
 * suya. Pasó con Waira en agosto de 2026, y de paso corría a los otros dos
 * asesores una posición.
 *
 * Los huecos quedan vacíos a propósito: son los puestos que la tienda no tiene.
 */
export function asignarBloques(people: RdvPerson[]): Array<RdvPerson | null> {
  const bloques: Array<RdvPerson | null> = Array(PERSON_BLOCKS).fill(null);
  const pendientes = new Map<TeamRole, RdvPerson[]>([
    ["GERENTE", people.filter((p) => p.role === "GERENTE")],
    ["SUBGERENTE", people.filter((p) => p.role === "SUBGERENTE")],
    ["ASESOR", people.filter((p) => p.role === "ASESOR")]
  ]);

  BLOQUES_POR_PUESTO.forEach((puesto, indice) => {
    const cola = pendientes.get(puesto);
    if (cola && cola.length > 0) bloques[indice] = cola.shift() ?? null;
  });

  /*
   * ⚠️ Si sobra alguien se DETIENE, no se le busca hueco.
   *
   * Meterlo en el bloque libre más cercano es exactamente el fallo que esto
   * viene a arreglar: acabaría cobrando con el porcentaje de otro puesto. Vale
   * más un export que no sale y dice por qué.
   */
  for (const [puesto, cola] of pendientes) {
    if (cola.length > 0) {
      const reservados = BLOQUES_POR_PUESTO.filter((p) => p === puesto).length;
      throw new Error(
        `El formato RDV reserva ${reservados} lugar(es) para ${puesto} y esta tienda tiene ${reservados + cola.length}.`
      );
    }
  }
  return bloques;
}

function roleLabel(role: TeamRole, previous: RdvPerson[]) {
  if (role === "GERENTE") return "GERENTE";
  const count = previous.filter((person) => person.role === role).length;
  return role === "SUBGERENTE" ? `SUBGERENTE ${count}` : `VENDEDOR ${count}`;
}

function storePresentation(storeName: string) {
  const normalized = storeName.trim().replace(/\s+/g, " ");
  if (/^TH\b/i.test(normalized)) {
    return { brand: "TOMMY HILFIGER", center: titleKnownCenter(normalized.replace(/^TH\b/i, "").trim()) };
  }
  if (/^GUESS\b/i.test(normalized)) {
    return { brand: "GUESS", center: titleKnownCenter(normalized.replace(/^GUESS\b/i, "").trim()) };
  }
  return { brand: normalized, center: normalized };
}

function titleKnownCenter(value: string) {
  const upper = value.toUpperCase();
  if (upper === "SAN AGUSTIN" || upper === "SAN AGUSTÍN") return "San Agustín";
  if (upper === "GALERIAS" || upper === "GALERÍAS") return "Galerías";
  return value.toLocaleLowerCase("es-MX").replace(/(^|\s)\p{L}/gu, (match) => match.toLocaleUpperCase("es-MX"));
}

function monthName(label: string) {
  return label.replace(/\s+\d{4}$/, "").toLocaleUpperCase("es-MX");
}

/**
 * `RDV TH SAN AGUSTIN AGOSTO 2026.xlsx`
 *
 * Con el mes por su nombre y no con las dos fechas del periodo: quien recibe el
 * archivo busca \u00abagosto\u00bb, no \u00ab2026-08-02 al 2026-08-29\u00bb. Los l\u00edmites exactos del
 * mes retail est\u00e1n dentro del documento.
 *
 * \u26a0\ufe0f El mes es el **RETAIL**, que no siempre coincide con el natural: agosto de
 * 2026 va del 2 de agosto al 29. Se toma de `retailMonth.label`, la misma
 * fuente que llena la portada, para que el nombre no pueda decir un mes y el
 * contenido otro.
 *
 * Se quitan acentos y se dejan solo letras, n\u00fameros y espacios: `\u00d1`, `/` o `:`
 * rompen la descarga en Windows o llegan mal por la cabecera.
 */
/**
 * Quita `hidden` de las columnas entre `desde` y `hasta`, ambas incluidas.
 *
 * Un `<col>` de OOXML cubre un rango (`min`..`max`), así que un rango oculto
 * puede solaparse solo en parte con el que hay que mostrar. Cuando pasa, se
 * parte en tres: lo de antes sigue oculto, lo de en medio se muestra y lo de
 * después sigue oculto. Mostrar el rango entero escondería de menos —enseñaría
 * columnas vacías— y no tocarlo escondería de más.
 */
export function mostrarColumnas(sheet: string, desde: number, hasta: number): string {
  return sheet.replace(/<col\b[^>]*\/>/g, (etiqueta) => {
    if (!/\bhidden="1"/.test(etiqueta)) return etiqueta;
    const min = Number(etiqueta.match(/\bmin="(\d+)"/)?.[1]);
    const max = Number(etiqueta.match(/\bmax="(\d+)"/)?.[1]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return etiqueta;
    if (max < desde || min > hasta) return etiqueta;

    const conRango = (a: number, b: number, oculto: boolean) =>
      etiqueta
        .replace(/\bmin="\d+"/, `min="${a}"`)
        .replace(/\bmax="\d+"/, `max="${b}"`)
        .replace(/\s*hidden="1"/, oculto ? ' hidden="1"' : "");

    const partes: string[] = [];
    if (min < desde) partes.push(conRango(min, desde - 1, true));
    partes.push(conRango(Math.max(min, desde), Math.min(max, hasta), false));
    if (max > hasta) partes.push(conRango(hasta + 1, max, true));
    return partes.join("");
  });
}

export function buildRdvFilename(state: Pick<RdvExportState, "store" | "retailMonth">) {
  const limpio = (texto: string) =>
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleUpperCase("es-MX");

  const a\u00f1o = state.retailMonth.label.match(/\d{4}$/)?.[0] ?? state.retailMonth.start.slice(0, 4);
  return `RDV ${limpio(state.store.name)} ${monthName(state.retailMonth.label)} ${a\u00f1o}.xlsx`;
}

function cleanOption(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function isTeamRole(value: Role): value is TeamRole {
  return TEAM_ROLES.includes(value as TeamRole);
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredSheet(sheets: Map<string, string>, name: string) {
  const value = sheets.get(name);
  if (!value) throw new Error(`La plantilla no tiene la hoja «${name}».`);
  return value;
}

function hasFormula(xml: string, address: string) {
  const pattern = new RegExp(`<c r="${address}"[^>]*?(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  return /<f(?:\s|>|\/)/.test(xml.match(pattern)?.[0] ?? "");
}

function expandSharedFormulas(xml: string) {
  const anchors = new Map<string, { address: string; formula: string }>();
  for (const cell of xml.matchAll(/<c r="([A-Z]+\d+)"[^>]*?(?<!\/)>([\s\S]*?)<\/c>/g)) {
    const formula = cell[2].match(/<f\b([^>]*\bt="shared"[^>]*)>([\s\S]*?)<\/f>/);
    const sharedIndex = formula?.[1].match(/\bsi="(\d+)"/)?.[1];
    if (sharedIndex !== undefined && formula?.[2]) {
      anchors.set(sharedIndex, { address: cell[1], formula: formula[2] });
    }
  }

  return xml.replace(
    /<c r="([A-Z]+\d+)"([^>]*?)(?<!\/)>([\s\S]*?)<\/c>/g,
    (cell, address: string, attrs: string, body: string) => {
      const expanded = body.replace(
        /<f\b([^>]*\bt="shared"[^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/,
        (_formulaTag, formulaAttrs: string, formula: string | undefined) => {
          if (formula) return `<f>${formula}</f>`;
          const sharedIndex = formulaAttrs.match(/\bsi="(\d+)"/)?.[1];
          const anchor = sharedIndex === undefined ? undefined : anchors.get(sharedIndex);
          if (!anchor) throw new Error(`Formula compartida sin ancla en ${address}.`);
          return `<f>${translateFormula(anchor.formula, anchor.address, address)}</f>`;
        }
      );
      return expanded === body ? cell : `<c r="${address}"${attrs}>${expanded}</c>`;
    }
  );
}

function translateFormula(formula: string, sourceAddress: string, targetAddress: string) {
  const source = splitAddress(sourceAddress);
  const target = splitAddress(targetAddress);
  const columnOffset = target.column - source.column;
  const rowOffset = target.row - source.row;
  return formula.replace(
    /(?<![A-Z0-9_])(\$?)([A-Z]{1,3})(\$?)(\d+)/g,
    (reference, absoluteColumn: string, letters: string, absoluteRow: string, rowText: string) => {
      const column = columnIndex(letters) + (absoluteColumn ? 0 : columnOffset);
      const row = Number(rowText) + (absoluteRow ? 0 : rowOffset);
      if (column < 1 || row < 1) throw new Error(`Referencia invalida al expandir ${reference} en ${targetAddress}.`);
      return `${absoluteColumn}${columnLetter(column)}${absoluteRow}${row}`;
    }
  );
}

function splitAddress(address: string) {
  const match = address.match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Celda invalida: ${address}.`);
  return { column: columnIndex(match[1]), row: Number(match[2]) };
}

function clearFormulaCaches(xml: string) {
  return xml.replace(
    /<c r="([A-Z]+\d+)"([^>]*?)(?<!\/)>([\s\S]*?)<\/c>/g,
    (match, address: string, attrs: string, body: string) => {
      const formula = body.match(/<f[^>]*\/>|<f[^>]*>[\s\S]*?<\/f>/)?.[0];
      if (!formula) return match;
      const cleanAttrs = attrs.replace(/\st="(?:e|str)"/g, "");
      return `<c r="${address}"${cleanAttrs}>${formula}</c>`;
    }
  );
}

function clearStaticCells(xml: string) {
  return xml.replace(
    /<c r="([A-Z]+\d+)"([^>]*?)(?<!\/)>([\s\S]*?)<\/c>/g,
    (match, address: string, attrs: string, body: string) => {
      if (/<f(?:\s|>|\/)/.test(body)) return match;
      const style = attrs.match(/\ss="\d+"/)?.[0] ?? "";
      return `<c r="${address}"${style}/>`;
    }
  );
}

function selectActiveSheet(xml: string, activeTab: number) {
  return xml.replace(
    /<workbookView\b([^>]*?)\bactiveTab="\d+"([^>]*)\/>/,
    `<workbookView$1activeTab="${activeTab}"$2/>`
  );
}

function selectWorksheet(xml: string, selected: boolean) {
  let next = xml.replace(/\stabSelected="1"/g, "");
  if (selected) next = next.replace(/<sheetView\b/, '<sheetView tabSelected="1"');
  return next;
}

async function clearChartCaches(zip: JSZip) {
  const chartPaths = Object.keys(zip.files).filter((name) => /^xl\/charts\/chart\d+\.xml$/.test(name));
  for (const chartPath of chartPaths) {
    const chart = await readPart(zip, chartPath);
    zip.file(
      chartPath,
      chart
        .replace(/<c:strCache>[\s\S]*?<\/c:strCache>/g, "")
        .replace(/<c:numCache>[\s\S]*?<\/c:numCache>/g, "")
    );
  }
}

function forceFullRecalculation(xml: string) {
  const calc = '<calcPr calcId="191028" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>';
  return /<calcPr[^>]*\/>/.test(xml) ? xml.replace(/<calcPr[^>]*\/>/, calc) : xml.replace("</workbook>", `${calc}</workbook>`);
}

async function removeStaleCalculationParts(zip: JSZip) {
  zip.remove("xl/calcChain.xml");
  const contentTypesPath = "[Content_Types].xml";
  const relationshipsPath = "xl/_rels/workbook.xml.rels";
  const contentTypes = await readPart(zip, contentTypesPath);
  const relationships = await readPart(zip, relationshipsPath);
  zip.file(contentTypesPath, contentTypes.replace(/<Override[^>]*calcChain\.xml"[^>]*\/>/g, ""));
  zip.file(relationshipsPath, relationships.replace(/<Relationship[^>]*calcChain\.xml"[^>]*\/>/g, ""));
}

async function pruneUnusedSharedStrings(zip: JSZip) {
  const sharedPath = "xl/sharedStrings.xml";
  const sharedFile = zip.file(sharedPath);
  if (!sharedFile) return;

  const worksheetPaths = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  const worksheets = new Map<string, string>();
  const used = new Set<number>();
  for (const worksheetPath of worksheetPaths) {
    const xml = await readPart(zip, worksheetPath);
    worksheets.set(worksheetPath, xml);
    for (const match of xml.matchAll(/<c\b[^>]*\bt="s"[^>]*>([\s\S]*?)<\/c>/g)) {
      const index = match[1].match(/<v>(\d+)<\/v>/)?.[1];
      if (index !== undefined) used.add(Number(index));
    }
  }

  const shared = await sharedFile.async("string");
  const strings = Array.from(shared.matchAll(/<si>[\s\S]*?<\/si>/g)).map((match) => match[0]);
  const oldToNew = new Map<number, number>();
  const nextStrings: string[] = [];
  for (const oldIndex of Array.from(used).sort((left, right) => left - right)) {
    const item = strings[oldIndex];
    if (!item) continue;
    oldToNew.set(oldIndex, nextStrings.length);
    nextStrings.push(item);
  }

  for (const [worksheetPath, xml] of worksheets.entries()) {
    zip.file(
      worksheetPath,
      xml.replace(/(<c\b[^>]*\bt="s"[^>]*>[\s\S]*?<v>)(\d+)(<\/v>[\s\S]*?<\/c>)/g, (match, prefix: string, indexText: string, suffix: string) => {
        const nextIndex = oldToNew.get(Number(indexText));
        return nextIndex === undefined ? match : `${prefix}${nextIndex}${suffix}`;
      })
    );
  }

  const nextShared = shared
    .replace(/\scount="\d+"/, ` count="${nextStrings.length}"`)
    .replace(/\suniqueCount="\d+"/, ` uniqueCount="${nextStrings.length}"`)
    .replace(/<si>[\s\S]*<\/si>/, nextStrings.join(""));
  zip.file(sharedPath, nextShared);
}
