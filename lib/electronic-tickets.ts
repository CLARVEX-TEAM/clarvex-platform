/**
 * Ticket electrónico: captura semanal y tasa de captura.
 *
 * Por qué existe esta captura: el dato vive en el POS, que NO exporta. Antes se
 * filtraba a diario y se pasaba a mano al RDV, y por eso la columna
 * `TX CAP CRM` llevaba meses vacía: pedía 70 números por semana. Aquí se piden
 * cinco.
 *
 * Sin Prisma a propósito, para poder probar las reglas sin base de datos.
 */

/** Piso de tickets para entrar al ranking. Con 3 tickets, 3 capturas es 100% y no significa nada. */
export const MIN_TICKETS_FOR_RANKING = 20;

export type CaptureRow = {
  /** Tickets del RDV en la semana (suma de los días). Es el denominador por omisión. */
  rdvTransactions: number;
  /** Tickets según el POS. Solo se captura si no cuadra con el RDV. */
  posTransactions: number | null;
  /** Tickets electrónicos capturados. */
  crmTransactions: number | null;
};

/**
 * Denominador de la tasa.
 *
 * Manda el POS si gerencia lo capturó: numerador y denominador tienen que venir
 * de la misma fuente o la tasa miente. Si no, el RDV.
 */
export function captureDenominator(row: CaptureRow): number {
  return row.posTransactions ?? row.rdvTransactions;
}

/**
 * Tasa de captura, de 0 a 1. `null` cuando no se puede calcular.
 *
 * Devuelve null (que la interfaz pinta como «—») y NUNCA 0, siguiendo la regla
 * del proyecto: sin tickets no es que la tasa sea cero, es que no hay tasa.
 */
export function captureRate(row: CaptureRow): number | null {
  if (row.crmTransactions === null || row.crmTransactions === undefined) return null;
  const denominator = captureDenominator(row);
  if (!denominator || denominator <= 0) return null;
  return row.crmTransactions / denominator;
}

/** ¿Entra en el ranking? Se exige un mínimo para que la tasa signifique algo. */
export function qualifiesForRanking(row: CaptureRow): boolean {
  return captureDenominator(row) >= MIN_TICKETS_FOR_RANKING && captureRate(row) !== null;
}

export type CaptureIssue = "negativo" | "excede" | null;

/**
 * Valida un número capturado ANTES de guardarlo.
 *
 * Lo importante es «excede»: más tickets electrónicos que tickets totales es un
 * dedazo o un desajuste entre POS y RDV. Se avisa en el momento, no dos semanas
 * después cuando alguien mire un ranking imposible.
 */
export function validateCapture(row: CaptureRow): CaptureIssue {
  if (row.crmTransactions === null || row.crmTransactions === undefined) return null;
  if (row.crmTransactions < 0) return "negativo";
  const denominator = captureDenominator(row);
  if (denominator > 0 && row.crmTransactions > denominator) return "excede";
  return null;
}

/** Etiqueta corta de una semana: «Sem 31 · 27 jul – 2 ago». */
export function weekLabel(weekNumber: number, weekStart: Date, weekEnd: Date): string {
  const day = (date: Date) => date.getUTCDate();
  const month = (date: Date) =>
    ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][date.getUTCMonth()];
  const sameMonth = weekStart.getUTCMonth() === weekEnd.getUTCMonth();
  const range = sameMonth
    ? `${day(weekStart)}–${day(weekEnd)} ${month(weekEnd)}`
    : `${day(weekStart)} ${month(weekStart)} – ${day(weekEnd)} ${month(weekEnd)}`;
  return `Sem ${weekNumber} · ${range}`;
}

/** Total del mes a partir de las semanas capturadas. Ignora las que no tienen dato. */
export function monthTotals(rows: CaptureRow[]): { crm: number; tickets: number; rate: number | null } {
  let crm = 0;
  let tickets = 0;
  for (const row of rows) {
    if (row.crmTransactions === null || row.crmTransactions === undefined) continue;
    crm += row.crmTransactions;
    tickets += captureDenominator(row);
  }
  return { crm, tickets, rate: tickets > 0 ? crm / tickets : null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura: cómo se PRESENTA el dato ya agregado en el reporte de KPIs.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que trae cada línea del reporte (asesor, equipo o tienda). */
export type ReportedTickets = {
  crmTransactions: number | null;
  /** Denominador congelado al capturar. Cubre SOLO las semanas medidas. */
  posTransactions: number | null;
};

/**
 * Tasa de un renglón del reporte, de 0 a 100.
 *
 * Usa `posTransactions` y NO los tickets totales del periodo a propósito: el
 * denominador congelado cubre solo las semanas capturadas. Dividir entre todos
 * los tickets del mes hundiría la tasa fingiendo ceros en las semanas que aún
 * no se han medido.
 */
export function reportedRate(row: ReportedTickets | null | undefined): number | null {
  if (!row || row.crmTransactions === null || !row.posTransactions) return null;
  return (row.crmTransactions / row.posTransactions) * 100;
}

/** ¿Qué meta le toca? Gerencia se mide contra la tienda; el asesor contra la suya. */
export function targetForRole(role: string, storeTarget: number | null, advisorTarget: number | null): number | null {
  return role === "ASESOR" ? advisorTarget : storeTarget;
}

export type RateStatus = "sin-dato" | "sin-meta" | "cumple" | "cerca" | "abajo";

/**
 * Estado del renglón contra su meta.
 *
 * «cerca» existe para no pintar en rojo a quien va a 2 puntos: en piso, un rojo
 * que sale siempre deja de leerse.
 */
export function rateStatus(rate: number | null, target: number | null): RateStatus {
  if (rate === null) return "sin-dato";
  if (target === null || target <= 0) return "sin-meta";
  if (rate >= target) return "cumple";
  return rate >= target - 5 ? "cerca" : "abajo";
}

/** Suma de varios renglones (p. ej. el equipo completo). */
export function sumTickets(rows: Array<ReportedTickets | null | undefined>): ReportedTickets {
  let crm: number | null = null;
  let pos: number | null = null;
  for (const row of rows) {
    if (!row || row.crmTransactions === null) continue;
    crm = (crm ?? 0) + row.crmTransactions;
    pos = (pos ?? 0) + (row.posTransactions ?? 0);
  }
  return { crmTransactions: crm, posTransactions: pos };
}

/** «84.2 %» o «—». Nunca 0 % cuando lo que falta es el dato. */
export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${rate.toFixed(1)}%`;
}

/** Lee el valor de una meta del arreglo de KpiTarget. `null` si no está puesta. */
export function targetValue(targets: Array<{ metric: string; value: number }>, metric: string): number | null {
  const found = targets.find((target) => target.metric === metric);
  return found ? found.value : null;
}
