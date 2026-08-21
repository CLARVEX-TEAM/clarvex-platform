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
  /**
   * Bruto y descuento del DIA, con IVA, tal como los da el reporte del POS.
   * Van juntos o no van: con uno solo el margen no se puede calcular. Ausentes
   * (undefined/null) NO se tocan — capturar KPIs a mano no debe borrar el
   * margen que ya tenga la fila.
   */
  grossSales?: number | string | null;
  discountAmount?: number | string | null;
};

export type NormalizedKpiEntry = {
  employeeNumber: string;
  date: Date;
  dailyGoal: number;
  dailySales: number;
  transactions: number;
  pieces: number;
  /** null = no se capturo, se deja como este. */
  grossSales: number | null;
  discountAmount: number | null;
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

  /*
   * `signed` marca los campos que SÍ pueden ir en negativo.
   *
   * Solo la venta. Una devolución de cliente que no se compensa con otra venta
   * deja el día en rojo, y así hay que registrarlo: se resta del acumulado de
   * la persona y del total de la tienda.
   *
   * ⚠️ Las PIEZAS no. Las de `Kpi` son brutas —el POS reporta las devoluciones
   * aparte y el kardex las toma como su propio movimiento—, así que una pieza
   * negativa aquí regresaría la mercancía al inventario dos veces. Meta y
   * tickets tampoco: no significan nada en negativo.
   */
  const fields: Array<[keyof NormalizedKpiEntry, unknown, string, number, boolean]> = [
    ["dailyGoal", entry.dailyGoal, "meta diaria", MAX_SALES, false],
    ["dailySales", entry.dailySales, "venta", MAX_SALES, true],
    ["transactions", entry.transactions, "tickets", MAX_COUNT, false],
    ["pieces", entry.pieces, "piezas", MAX_COUNT, false]
  ];

  const values: Record<string, number> = {};
  for (const [key, raw, label, max, signed] of fields) {
    const parsed = toNumber(raw);
    if (parsed === null) {
      return { ok: false, error: `${employeeNumber} (${entry.date}): ${label} no es un número.` };
    }
    if (parsed < 0 && !signed) {
      return { ok: false, error: `${employeeNumber} (${entry.date}): ${label} no puede ser negativa.` };
    }
    // El tope de captura vale en los dos sentidos: −1,000,000 de venta es tan
    // imposible como +1,000,000, y suele ser un cero de más.
    if (Math.abs(parsed) > max) {
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

  const margin = normalizeMargin(entry, `${employeeNumber} (${entry.date})`);
  if (!margin.ok) return { ok: false, error: margin.error };

  return {
    ok: true,
    value: {
      employeeNumber,
      date,
      dailyGoal: values.dailyGoal,
      dailySales: values.dailySales,
      transactions: values.transactions,
      pieces: values.pieces,
      grossSales: margin.grossSales,
      discountAmount: margin.discountAmount
    }
  };
}

/**
 * Bruto y descuento del dia. Se validan aparte de las cuatro cifras porque
 * pueden faltar: ausentes significan «no se capturo», no cero.
 */
function normalizeMargin(entry: KpiCaptureEntry, who: string): { ok: true; grossSales: number | null; discountAmount: number | null } | { ok: false; error: string } {
  const absent = (raw: unknown) => raw === undefined || raw === null || raw === "";
  const noGross = absent(entry.grossSales);
  const noDiscount = absent(entry.discountAmount);
  if (noGross && noDiscount) return { ok: true, grossSales: null, discountAmount: null };
  if (noGross !== noDiscount) {
    return { ok: false, error: `${who}: llego el bruto o el descuento, pero no los dos. Con uno solo no hay margen.` };
  }

  const grossSales = toNumber(entry.grossSales);
  const discountAmount = toNumber(entry.discountAmount);
  if (grossSales === null || discountAmount === null) {
    return { ok: false, error: `${who}: el bruto o el descuento no son un numero.` };
  }
  if (grossSales < 0 || discountAmount < 0) {
    return { ok: false, error: `${who}: el bruto y el descuento no pueden ser negativos.` };
  }
  if (grossSales > MAX_SALES || discountAmount > MAX_SALES) {
    return { ok: false, error: `${who}: el bruto o el descuento parecen un error de captura.` };
  }
  // El descuento sale de la venta bruta: mayor que ella no existe, y el margen
  // pasaria del 100%.
  if (discountAmount > grossSales) {
    return { ok: false, error: `${who}: el descuento (${discountAmount}) es mayor que la venta bruta (${grossSales}).` };
  }
  return { ok: true, grossSales, discountAmount };
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

/** Techo defensivo: el tráfico diario de una tienda no llega a esto. */
const MAX_TRAFFIC = 100_000;

export type TrafficCaptureEntry = {
  date: string;
  /** Opcional: una casilla que nadie tocó llega sin valor y cuenta como cero. */
  value?: number | string | null;
};

export type NormalizedTraffic = {
  date: Date;
  value: number;
};

/**
 * Valida el tráfico de un día.
 *
 * El tráfico es de TIENDA, no de persona, pero se guarda repetido en la fila de
 * cada asesor de ese día porque así lo escribe el importador y así lo espera
 * `aggregateStoreTraffic`, que toma el MÁXIMO por fecha —no la suma— para no
 * multiplicarlo por el número de personas.
 */
export function normalizeTrafficEntry(entry: TrafficCaptureEntry):
  | { ok: true; value: NormalizedTraffic }
  | { ok: false; error: string } {
  if (!DATE_PATTERN.test(entry.date ?? "")) {
    return { ok: false, error: `Tráfico: fecha inválida (${String(entry.date)}), se espera AAAA-MM-DD.` };
  }
  const date = new Date(`${entry.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== entry.date) {
    return { ok: false, error: `Tráfico: fecha inexistente (${entry.date}).` };
  }

  const value = toNumber(entry.value);
  if (value === null) return { ok: false, error: `Tráfico (${entry.date}): no es un número.` };
  if (value < 0) return { ok: false, error: `Tráfico (${entry.date}): no puede ser negativo.` };
  if (value > MAX_TRAFFIC) {
    return { ok: false, error: `Tráfico (${entry.date}): ${value} parece un error de captura.` };
  }

  return { ok: true, value: { date, value } };
}

/**
 * `tickets / tráfico`, en porcentaje. Es la conversión de TIENDA.
 *
 * Devuelve `null` si no hay tráfico —y `Kpi.conversion` sí es nulable—, porque
 * sin visitantes la conversión no es 0 %: es desconocida. Un 0 se leería como
 * «entró gente y no compró nadie», que es una afirmación distinta.
 */
export function computeConversion(transactions: number, traffic: number): number | null {
  return traffic > 0 ? (transactions * 100) / traffic : null;
}
