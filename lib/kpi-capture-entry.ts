/**
 * Validación de una fila de KPI capturada a mano.
 *
 * Vive aparte de `lib/kpi-capture` porque ese módulo importa Prisma, y
 * `lib/prisma` lanza en el entorno de pruebas para que ningún test unitario
 * toque una base real.
 *
 * ⚠️ Aquí SOLO viajan los datos crudos que una persona lee del punto de venta:
 * meta, venta, tickets, piezas y tráfico. Todo lo demás —`upt`, `avgTicket`,
 * `ranking`, los acumulados del mes— se DERIVA, igual que hace el importador
 * del RDV. Si la pantalla pudiera mandar un `upt` cualquiera, los KPIs dejarían
 * de cuadrar con sus propios sumandos y nadie lo notaría hasta cerrar el mes.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Techo defensivo: una venta diaria por persona nunca llega a esto. */
const MAX_SALES = 10_000_000;
const MAX_COUNT = 100_000;

/**
 * Las cuatro cifras son opcionales: una celda que nadie tocó llega como
 * `undefined` y cuenta como cero, igual que una vacía. Distinguirlas obligaría
 * a quien captura a escribir ceros para decir «no vendió».
 */
export type KpiCaptureEntry = {
  employeeNumber: string;
  date: string;
  dailyGoal?: number | string | null;
  dailySales?: number | string | null;
  transactions?: number | string | null;
  pieces?: number | string | null;
};

export type NormalizedKpiEntry = {
  employeeNumber: string;
  date: Date;
  dailyGoal: number;
  dailySales: number;
  transactions: number;
  pieces: number;
};

export type NormalizeKpiOutcome =
  | { ok: true; value: NormalizedKpiEntry }
  | { ok: false; error: string };

export function normalizeKpiEntry(entry: KpiCaptureEntry): NormalizeKpiOutcome {
  const employeeNumber = String(entry.employeeNumber ?? "").trim();
  if (!employeeNumber) return { ok: false, error: "Falta el número de empleado." };

  if (!DATE_PATTERN.test(entry.date ?? "")) {
    return { ok: false, error: `Fecha inválida en ${employeeNumber}: se espera AAAA-MM-DD.` };
  }
  // Medianoche UTC, igual que el importador: la clave única de `Kpi` es
  // (userId, date) y se compara por igualdad exacta.
  const date = new Date(`${entry.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== entry.date) {
    return { ok: false, error: `Fecha inexistente en ${employeeNumber}: ${entry.date}.` };
  }

  const fields: Array<[keyof NormalizedKpiEntry, unknown, string, number]> = [
    ["dailyGoal", entry.dailyGoal, "meta diaria", MAX_SALES],
    ["dailySales", entry.dailySales, "venta", MAX_SALES],
    ["transactions", entry.transactions, "tickets", MAX_COUNT],
    ["pieces", entry.pieces, "piezas", MAX_COUNT]
  ];

  const values: Record<string, number> = {};
  for (const [key, raw, label, max] of fields) {
    const parsed = toNumber(raw);
    if (parsed === null) {
      return { ok: false, error: `${employeeNumber} (${entry.date}): ${label} no es un número.` };
    }
    if (parsed < 0) {
      return { ok: false, error: `${employeeNumber} (${entry.date}): ${label} no puede ser negativa.` };
    }
    if (parsed > max) {
      return { ok: false, error: `${employeeNumber} (${entry.date}): ${label} parece un error de captura (${parsed}).` };
    }
    values[key as string] = parsed;
  }

  // Piezas por debajo de tickets es imposible: cada ticket lleva al menos una
  // pieza. Suele ser que se invirtieron las columnas al capturar.
  if (values.transactions > 0 && values.pieces > 0 && values.pieces < values.transactions) {
    return {
      ok: false,
      error: `${employeeNumber} (${entry.date}): hay más tickets (${values.transactions}) que piezas (${values.pieces}). ¿Se invirtieron las columnas?`
    };
  }
  // Venta sin tickets no puede ser: algo se cobró en alguna parte.
  if (values.dailySales > 0 && values.transactions === 0) {
    return {
      ok: false,
      error: `${employeeNumber} (${entry.date}): hay venta (${values.dailySales}) pero cero tickets.`
    };
  }

  return {
    ok: true,
    value: {
      employeeNumber,
      date,
      dailyGoal: values.dailyGoal,
      dailySales: values.dailySales,
      transactions: values.transactions,
      pieces: values.pieces
    }
  };
}

/** Acepta número o texto con separadores de miles, comas y símbolo de moneda. */
function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).trim().replace(/[$\s,]/g, "");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * `piezas / tickets`.
 *
 * Devuelve **0** cuando no hay tickets, no `null`, por dos razones: `Kpi.upt` es
 * no nulable en el esquema, y es lo que hace `ratio()` en el importador del RDV
 * — una fila capturada y una importada tienen que ser indistinguibles.
 *
 * Lo de mostrar «—» en vez de 0 cuando el divisor es cero es cosa de la CAPA DE
 * VISTA (`lib/kpi-view.ts`), no del dato guardado.
 */
export function computeUpt(pieces: number, transactions: number): number {
  return transactions > 0 ? pieces / transactions : 0;
}

/** `venta / tickets` — lo que el RDV llama EPT y la base guarda como avgTicket. */
export function computeAvgTicket(dailySales: number, transactions: number): number {
  return transactions > 0 ? dailySales / transactions : 0;
}

/** Alcance en porcentaje, el criterio con el que se ordena el ranking del día. */
export function computeAchievement(dailySales: number, dailyGoal: number): number {
  return dailyGoal > 0 ? (dailySales / dailyGoal) * 100 : 0;
}
