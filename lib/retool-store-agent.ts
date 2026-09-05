import type { ManagerDashboardMetric } from "@/lib/retool-manager-dashboard";
import { buildManagerDashboardMetric } from "@/lib/retool-manager-dashboard";

const DAY_MS = 86_400_000;

export type StoreAgentRoute = {
  type: "retool";
  path: "/horarios" | "/asistencia" | "/kpis" | "/cuota-justa" | "/descuentos" | "/kardex" | "/ticket-electronico";
} | {
  type: "clarvex";
  path: "/pendientes" | "/escritorio/pendientes";
};

export type StoreAgentSeverity = "critical" | "warning" | "info";

export type StoreAgentAction = {
  id: string;
  severity: StoreAgentSeverity;
  title: string;
  detail: string;
  source: "KPIS" | "ASISTENCIA" | "PENDIENTES" | "KARDEX" | "CUOTA_JUSTA" | "HORARIOS";
  route: StoreAgentRoute;
  label: string;
  count?: number;
  status?: string;
  period?: { start: string; end: string; label: string };
};

export type StoreAgentPeriodKey = "today" | "wtd" | "mtd" | "lastClosedMonth";

/**
 * Lo acumulado dentro de un periodo HASTA la fecha operativa.
 *
 * Va separado de `metric` —que cubre el rango entero, con su meta total— para
 * que nadie tenga que adivinar cuál de las dos está mirando. Mezclarlos es el
 * fallo que esta separación existe para impedir.
 */
export type StoreAgentToDate = {
  /** Último día incluido: hoy, o el fin del rango si ya terminó. */
  end: string;
  metric: ManagerDashboardMetric;
  rowCount: number;
  /** Días del rango ya vividos, contando hoy. */
  elapsedDays: number;
  /** Días del rango entero. La meta total de `metric` corresponde a estos. */
  totalDays: number;
  /** Fechas DISTINTAS con captura dentro de lo transcurrido. */
  capturedDays: number;
  /** El rango terminó. NO afirma que la captura esté completa. */
  periodEnded: boolean;
  /**
   * Hay captura en todos los días transcurridos.
   *
   * ⚠️ Es una condición NECESARIA, no suficiente: dice que ningún día está
   * vacío, no que lo capturado sea correcto ni que estén todas las personas.
   */
  captureComplete: boolean;
};

export type StoreAgentPeriod = {
  key: StoreAgentPeriodKey;
  title: string;
  label: string;
  /** Inicio y fin del rango COMPLETO. No se mueven con el día. */
  start: string;
  end: string;
  /**
   * El rango completo, con su META TOTAL.
   *
   * ⚠️ `achievement` de este bloque es contra la meta del mes o la semana
   * ENTERA. Al principio del periodo va a ser bajo por construcción, y eso no
   * significa atraso. Para el ritmo real está `toDate`.
   */
  metric: ManagerDashboardMetric;
  rowCount: number;
  /** Lo acumulado hasta hoy dentro de ese rango. */
  toDate: StoreAgentToDate;
  /** Los mismos días transcurridos, en el periodo anterior. */
  comparison?: {
    label: string;
    start: string;
    end: string;
    baseline: ManagerDashboardMetric;
    baselineDays: number;
    comparableDays: number;
    equivalent: boolean;
    baselineCapturedDays: number;
    salesDeltaPct: number | null;
    achievementDelta: number | null;
    transactionsDeltaPct: number | null;
    piecesDeltaPct: number | null;
  };
};

export type StoreAgentBrief = {
  mode: "store-agent-operational-v1";
  generatedAt: string;
  primaryKpi: StoreAgentPeriod;
  monthContext: StoreAgentPeriod;
  weekContext: StoreAgentPeriod;
  attention: StoreAgentAction[];
  quickActions: Array<{
    id: string;
    label: string;
    detail: string;
    route: StoreAgentRoute;
  }>;
  insights: string[];
  dataSources: Array<{
    label: string;
    source: string;
    range: string;
    formula: string;
  }>;
};

export type KpiPeriodRow = {
  date: Date;
  dailySales: { toString(): string } | number | null;
  dailyGoal: { toString(): string } | number | null;
  transactions: number;
  pieces: number;
  traffic: number | null;
};

export type WeeklyPerformanceCloseState = {
  id: string;
  weekStart: Date;
  weekEnd: Date;
  weekNumber: number;
  status: "DRAFT" | "FINALIZED" | string;
  quotaSavedAt: Date | null;
  reportSavedAt: Date | null;
  finalizedAt: Date | null;
};

export function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function percentDelta(current: number, baseline: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) return null;
  return Math.round(((current - baseline) / Math.abs(baseline)) * 10_000) / 100;
}

function number(value: { toString(): string } | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function clampEnd(end: Date, maxEnd: Date): Date {
  return end.getTime() > maxEnd.getTime() ? maxEnd : end;
}

/**
 * Días de un rango que YA se vivieron, contando hoy.
 *
 * ⚠️ **No es la longitud del rango.** Confundir las dos cosas es lo que hacía
 * que el agente comparara seis días capturados de un mes retail de treinta y
 * cinco contra el mes anterior COMPLETO. Con venta constante de cien pesos
 * diarios eso daba «−78.57 %» cuando la respuesta correcta es 0 %: no había
 * caído nada, simplemente aún no había pasado el mes.
 */
export type Transcurrido = {
  /** Último día que cuenta: hoy, o el fin del rango si ya terminó. */
  hasta: Date;
  /** Días ya vividos del rango, contando hoy. Cero si aún no empieza. */
  dias: number;
  /** Días que tiene el rango entero. Es a lo que corresponde la meta total. */
  diasTotales: number;
  /**
   * El rango ya terminó.
   *
   * ⚠️ **No dice nada sobre la captura.** Un mes puede haber terminado y seguir
   * con días sin capturar; son dos preguntas distintas y mezclarlas hace pasar
   * un hueco de captura por una caída de venta.
   */
  terminado: boolean;
};

export function transcurrido(inicio: Date, fin: Date, hoy: Date): Transcurrido {
  const dia = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY_MS);
  const diasTotales = Math.max(0, dia(fin, inicio) + 1);

  // Antes de que empiece no hay nada transcurrido, y el corte es el propio
  // inicio: devolver un `hasta` anterior daría rangos negativos aguas abajo.
  if (hoy.getTime() < inicio.getTime()) {
    return { hasta: inicio, dias: 0, diasTotales, terminado: false };
  }

  const terminado = hoy.getTime() > fin.getTime();
  const hasta = terminado ? fin : hoy;
  return { hasta, dias: Math.max(0, dia(hasta, inicio) + 1), diasTotales, terminado };
}

/**
 * La ventana del periodo anterior que cubre los MISMOS días transcurridos.
 *
 * ⚠️ **Los meses retail no duran lo mismo** (cuatro o cinco semanas), así que
 * la ventana equivalente puede no caber en el periodo anterior. Cuando eso
 * pasa se recorta y `equivalente` queda en `false`: la comparación sigue
 * sirviendo de contexto, pero no es una diferencia limpia y quien la lee tiene
 * que saberlo.
 */
export type VentanaEquivalente = {
  inicio: Date;
  fin: Date;
  /** Días que de verdad abarca, ya recortada. */
  dias: number;
  /** Cubre exactamente los días pedidos. */
  equivalente: boolean;
};

export function ventanaEquivalente(inicio: Date, fin: Date, dias: number): VentanaEquivalente {
  if (dias <= 0) {
    return { inicio, fin: inicio, dias: 0, equivalente: false };
  }
  const deseado = addDays(inicio, dias - 1);
  const recortado = clampEnd(deseado, fin);
  const reales = Math.max(0, Math.round((recortado.getTime() - inicio.getTime()) / DAY_MS) + 1);
  return { inicio, fin: recortado, dias: reales, equivalente: reales === dias };
}

/**
 * ⚠️ **Una fila con SOLO la meta NO es captura, y se contaba como tal.**
 *
 * Guardar Cuota Justa escribe la meta diaria de toda la semana por adelantado
 * (`lib/weekly-performance.ts`), y crea la fila con `dailySales`, `transactions`
 * y `pieces` en cero. Vista desde aquí, esa fila es indistinguible de un día ya
 * capturado, así que el agente daba el mes por completo el lunes y afirmaba
 * atraso comparando ceros contra metas reales — exactamente lo que la separación
 * entre «periodo terminado» y «captura completa» venía a impedir.
 *
 * La columna `dailySales` no es anulable, así que no hay un «sin capturar» que
 * mirar: lo que se comprueba es que haya ALGO de operación. Un día de venta cero
 * con cero tickets, cero piezas y sin tráfico se cuenta como no capturado, y eso
 * es deliberado: con captura incompleta el agente avisa del hueco en vez de
 * afirmar una caída, que es el error barato de los dos.
 *
 * ⚠️ La venta SÍ puede ser negativa (una devolución sin venta que la compense),
 * y eso es captura: por eso se compara contra cero, no «mayor que cero».
 */
export function tieneCaptura(row: {
  dailySales: { toString(): string } | number | null;
  transactions: number;
  pieces: number;
  traffic?: number | null;
}): boolean {
  return (
    number(row.dailySales) !== 0 ||
    row.transactions > 0 ||
    row.pieces > 0 ||
    (row.traffic ?? 0) > 0
  );
}

function aggregateRows(
  rows: KpiPeriodRow[],
  start: Date,
  end: Date
): { metric: ManagerDashboardMetric; rowCount: number; capturedDays: number } {
  const trafficByDate = new Map<string, number>();
  /*
   * ⚠️ Fechas DISTINTAS con captura, que no es lo mismo que el número de filas:
   * hay una fila por persona y por día. Cinco filas pueden ser un solo día
   * capturado, y confundirlos haría creer que un mes está completo cuando solo
   * está capturado el primer día con todo el equipo.
   *
   * ⚠️ Y con captura de verdad, no solo con fila: ver `tieneCaptura`.
   */
  const fechasConCaptura = new Set<string>();
  let sales = 0;
  let goal = 0;
  let transactions = 0;
  let pieces = 0;
  let rowCount = 0;

  for (const row of rows) {
    const time = row.date.getTime();
    if (time < start.getTime() || time > end.getTime()) continue;
    rowCount += 1;
    if (tieneCaptura(row)) fechasConCaptura.add(dateKey(row.date));
    sales += number(row.dailySales);
    goal += number(row.dailyGoal);
    transactions += row.transactions;
    pieces += row.pieces;
    if (row.traffic !== null) {
      const key = dateKey(row.date);
      trafficByDate.set(key, Math.max(trafficByDate.get(key) ?? 0, row.traffic));
    }
  }

  const traffic = trafficByDate.size > 0
    ? Array.from(trafficByDate.values()).reduce((total, value) => total + value, 0)
    : null;

  return {
    metric: buildManagerDashboardMetric({ sales, goal, transactions, pieces, traffic }),
    rowCount,
    capturedDays: fechasConCaptura.size
  };
}

/**
 * Compara lo acumulado HASTA LA FECHA contra los mismos días del periodo
 * anterior.
 *
 * ⚠️ **La línea base se recorta a los días transcurridos, no al periodo
 * entero.** Es la corrección del fallo: comparar un mes a medias contra un mes
 * completo mide el calendario, no la tienda.
 */
function buildComparison(
  label: string,
  rows: KpiPeriodRow[],
  ventana: VentanaEquivalente,
  diasPedidos: number,
  current: ManagerDashboardMetric
) {
  const base = aggregateRows(rows, ventana.inicio, ventana.fin);
  return {
    label,
    start: dateKey(ventana.inicio),
    end: dateKey(ventana.fin),
    baseline: base.metric,
    /** Días que abarca la base. Con meses retail de distinta duración puede no cuadrar. */
    baselineDays: ventana.dias,
    /** Días transcurridos que se querían comparar. */
    comparableDays: diasPedidos,
    /** La base cubre exactamente esos días: solo entonces la diferencia es limpia. */
    equivalent: ventana.equivalente,
    /** Días con captura dentro de la base. Un hueco aquí infla la diferencia. */
    baselineCapturedDays: base.capturedDays,
    salesDeltaPct: percentDelta(current.sales, base.metric.sales),
    achievementDelta:
      current.achievement !== null && base.metric.achievement !== null
        ? Math.round((current.achievement - base.metric.achievement) * 10) / 10
        : null,
    transactionsDeltaPct: percentDelta(current.transactions, base.metric.transactions),
    piecesDeltaPct: percentDelta(current.pieces, base.metric.pieces)
  };
}

function periodHasSignal(period: StoreAgentPeriod): boolean {
  return period.rowCount > 0 && (
    period.metric.sales > 0 ||
    period.metric.goal > 0 ||
    period.metric.transactions > 0 ||
    period.metric.pieces > 0
  );
}

function periodHasActivity(period: StoreAgentPeriod): boolean {
  return period.rowCount > 0 && (
    period.metric.sales > 0 ||
    period.metric.transactions > 0 ||
    period.metric.pieces > 0
  );
}

export function buildAgentPeriods(input: {
  rows: KpiPeriodRow[];
  today: Date;
  weekStart: Date;
  weekEnd: Date;
  retailMonthStart: Date;
  retailMonthEnd: Date;
  previousWeekStart: Date;
  previousWeekEnd: Date;
  previousMonthStart: Date;
  previousMonthEnd: Date;
  beforePreviousMonthStart: Date;
  beforePreviousMonthEnd: Date;
}): {
  today: StoreAgentPeriod;
  week: StoreAgentPeriod;
  month: StoreAgentPeriod;
  lastClosedMonth: StoreAgentPeriod;
  primary: StoreAgentPeriod;
  monthContext: StoreAgentPeriod;
} {
  /*
   * ⚠️ **Días TRANSCURRIDOS, no la longitud del rango.** La versión anterior
   * usaba `fin − inicio` del periodo entero, así que la ventana del mes
   * anterior salía del tamaño del mes completo y la comparación medía el
   * calendario en vez de la tienda.
   */
  const semanaCurso = transcurrido(input.weekStart, input.weekEnd, input.today);
  const mesCurso = transcurrido(input.retailMonthStart, input.retailMonthEnd, input.today);
  const cierreCurso = transcurrido(input.previousMonthStart, input.previousMonthEnd, input.today);

  const ventanaSemanaAnterior = ventanaEquivalente(input.previousWeekStart, input.previousWeekEnd, semanaCurso.dias);
  const ventanaMesAnterior = ventanaEquivalente(input.previousMonthStart, input.previousMonthEnd, mesCurso.dias);
  const ventanaAntesDelCierre = ventanaEquivalente(
    input.beforePreviousMonthStart,
    input.beforePreviousMonthEnd,
    cierreCurso.dias
  );

  const todayAgg = aggregateRows(input.rows, input.today, input.today);
  // Rango COMPLETO: de aquí sale la meta total, que no depende del día.
  const weekAgg = aggregateRows(input.rows, input.weekStart, input.weekEnd);
  const monthAgg = aggregateRows(input.rows, input.retailMonthStart, input.retailMonthEnd);
  const closedAgg = aggregateRows(input.rows, input.previousMonthStart, input.previousMonthEnd);
  // Acumulado HASTA HOY: es lo único que se puede comparar contra otro periodo.
  const weekToDate = aggregateRows(input.rows, input.weekStart, semanaCurso.hasta);
  const monthToDate = aggregateRows(input.rows, input.retailMonthStart, mesCurso.hasta);
  const closedToDate = aggregateRows(input.rows, input.previousMonthStart, cierreCurso.hasta);

  const weekClosed = input.weekEnd.getTime() < input.today.getTime();
  const monthClosed = input.retailMonthEnd.getTime() < input.today.getTime();

  const acumulado = (
    agg: { metric: ManagerDashboardMetric; rowCount: number; capturedDays: number },
    curso: Transcurrido
  ): StoreAgentToDate => ({
    end: dateKey(curso.hasta),
    metric: agg.metric,
    rowCount: agg.rowCount,
    elapsedDays: curso.dias,
    totalDays: curso.diasTotales,
    capturedDays: agg.capturedDays,
    periodEnded: curso.terminado,
    captureComplete: curso.dias > 0 && agg.capturedDays >= curso.dias
  });

  const today: StoreAgentPeriod = {
    key: "today",
    title: "Hoy",
    label: "Fecha operativa",
    start: dateKey(input.today),
    end: dateKey(input.today),
    metric: todayAgg.metric,
    rowCount: todayAgg.rowCount,
    toDate: acumulado(todayAgg, transcurrido(input.today, input.today, input.today))
  };
  const week: StoreAgentPeriod = {
    key: "wtd",
    title: weekClosed ? "Última semana capturada" : "Semana actual",
    label: "Semana",
    start: dateKey(input.weekStart),
    end: dateKey(input.weekEnd),
    metric: weekAgg.metric,
    rowCount: weekAgg.rowCount,
    toDate: acumulado(weekToDate, semanaCurso),
    // Contra el acumulado, NO contra el rango completo.
    comparison: buildComparison(
      "Semana anterior, mismos días",
      input.rows,
      ventanaSemanaAnterior,
      semanaCurso.dias,
      weekToDate.metric
    )
  };
  const month: StoreAgentPeriod = {
    key: "mtd",
    title: monthClosed ? "Cierre del mes" : "Mes en curso",
    label: monthClosed ? "Mes cerrado" : "Mes retail",
    start: dateKey(input.retailMonthStart),
    end: dateKey(input.retailMonthEnd),
    metric: monthAgg.metric,
    rowCount: monthAgg.rowCount,
    toDate: acumulado(monthToDate, mesCurso),
    comparison: buildComparison(
      "Mes anterior, mismos días",
      input.rows,
      ventanaMesAnterior,
      mesCurso.dias,
      monthToDate.metric
    )
  };
  const lastClosedMonth: StoreAgentPeriod = {
    key: "lastClosedMonth",
    title: "Cierre del mes",
    label: "Último mes cerrado",
    start: dateKey(input.previousMonthStart),
    end: dateKey(input.previousMonthEnd),
    metric: closedAgg.metric,
    rowCount: closedAgg.rowCount,
    toDate: acumulado(closedToDate, cierreCurso),
    comparison: buildComparison(
      "Mes anterior al cierre, mismos días",
      input.rows,
      ventanaAntesDelCierre,
      cierreCurso.dias,
      closedToDate.metric
    )
  };

  const primary = periodHasActivity(today)
    ? today
    : periodHasSignal(month)
      ? month
      : periodHasSignal(week)
        ? week
        : periodHasSignal(lastClosedMonth)
          ? lastClosedMonth
          : today;
  const monthContext = periodHasSignal(month) ? month : periodHasSignal(lastClosedMonth) ? lastClosedMonth : month;

  return { today, week, month, lastClosedMonth, primary, monthContext };
}

export function buildWeeklyPerformanceActions(closes: WeeklyPerformanceCloseState[]): StoreAgentAction[] {
  return closes.flatMap((close) => {
    const period = {
      start: dateKey(close.weekStart),
      end: dateKey(close.weekEnd),
      label: `Semana ${close.weekNumber}`
    };
    if (!close.quotaSavedAt) {
      return [{
        id: `weekly-quota-${period.start}`,
        severity: "warning" as const,
        title: "Guardar Cuota Justa",
        detail: `${period.label} cerró el ${period.end} y no tiene Cuota Justa guardada.`,
        source: "CUOTA_JUSTA" as const,
        route: { type: "retool" as const, path: "/cuota-justa" as const },
        label: "Abrir Cuota Justa",
        status: close.status,
        period
      }];
    }
    if (!close.reportSavedAt) {
      return [{
        id: `weekly-report-${period.start}`,
        severity: "warning" as const,
        title: "Guardar RDS semanal",
        detail: `${period.label} ya tiene Cuota Justa, pero falta guardar el reporte semanal.`,
        source: "CUOTA_JUSTA" as const,
        route: { type: "retool" as const, path: "/cuota-justa" as const },
        label: "Abrir RDS",
        status: close.status,
        period
      }];
    }
    return [];
  });
}

function sortActions(left: StoreAgentAction, right: StoreAgentAction): number {
  const rank: Record<StoreAgentSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return rank[left.severity] - rank[right.severity] || left.title.localeCompare(right.title, "es");
}

/**
 * El ritmo de un periodo: lo acumulado contra la meta de los días que YA
 * pasaron.
 *
 * ⚠️ **No es `period.metric.achievement`.** Ese va contra la meta del periodo
 * ENTERO, así que el día 2 de un mes retail de treinta y cinco da ~6 % y el
 * agente recomendaba «revisar cobertura antes del cierre» a una tienda que iba
 * al 100 % de lo que le tocaba. La corrección ya se había hecho en la anomalía
 * de `retool-store-audit.ts` y aquí se quedó sin hacer: mismo dato, dos lecturas
 * distintas en la misma pantalla.
 */
function ritmoDelPeriodo(period: StoreAgentPeriod): { pct: number | null; fiable: boolean } {
  const acumulado = period.toDate.metric;
  return {
    pct: acumulado.achievement,
    // Con un hueco de captura, el acumulado baja y la meta no: un día sin
    // capturar se lee igual que una caída de venta. No se juzga.
    fiable: period.toDate.elapsedDays > 0 && period.toDate.captureComplete && acumulado.goal > 0
  };
}

/**
 * ⚠️ La comparación contra el periodo anterior solo es limpia si cubre los
 * MISMOS días y los tiene capturados. Los meses retail duran cuatro o cinco
 * semanas, así que la ventana equivalente a veces se recorta; y un hueco en la
 * base infla la diferencia hacia arriba. Se dice, en vez de callarlo.
 */
function comparacionLimpia(comparison: StoreAgentPeriod["comparison"]): boolean {
  if (!comparison) return false;
  return comparison.equivalent && comparison.baselineCapturedDays >= comparison.comparableDays;
}

function buildInsights(input: {
  primary: StoreAgentPeriod;
  week: StoreAgentPeriod;
  monthContext: StoreAgentPeriod;
  attention: StoreAgentAction[];
}): string[] {
  const insights: string[] = [];
  const { toDate } = input.primary;
  const paso = ritmoDelPeriodo(input.primary);

  if (toDate.elapsedDays > 0 && toDate.capturedDays < toDate.elapsedDays) {
    insights.push(
      `${input.primary.label}: hay captura en ${toDate.capturedDays} de los ${toDate.elapsedDays} días transcurridos; ` +
        "el avance todavía no se puede leer como resultado de la tienda."
    );
  } else if (paso.fiable && paso.pct !== null) {
    if (paso.pct >= 100) {
      insights.push(`${input.primary.label} está arriba de la meta de lo transcurrido; mantener foco en tickets y piezas para no depender solo de ticket alto.`);
    } else if (paso.pct < 80) {
      insights.push(`${input.primary.label} va en ${paso.pct.toFixed(1)} % de la meta de los días transcurridos; revisar cobertura, tráfico y tickets antes del cierre.`);
    }
  }

  const mes = input.monthContext.comparison;
  const monthDelta = mes?.salesDeltaPct;
  if (mes && monthDelta !== null && monthDelta !== undefined) {
    const direction = monthDelta >= 0 ? "arriba" : "abajo";
    const matiz = comparacionLimpia(mes) ? "" : " (la ventana anterior no es equivalente: sirve de contexto, no de diferencia)";
    insights.push(`${input.monthContext.title} está ${Math.abs(monthDelta).toFixed(1)} % ${direction} contra ${mes.label.toLowerCase()}${matiz}.`);
  }

  const semana = input.week.comparison;
  const weekDelta = semana?.salesDeltaPct;
  if (semana && weekDelta !== null && weekDelta !== undefined && Math.abs(weekDelta) >= 10) {
    const direction = weekDelta >= 0 ? "subió" : "bajó";
    const matiz = comparacionLimpia(semana) ? "" : " (ventana no equivalente)";
    insights.push(`La semana ${direction} ${Math.abs(weekDelta).toFixed(1)} % contra la semana anterior comparable${matiz}.`);
  }

  if (input.attention.length > 0) {
    insights.push(`Hay ${input.attention.length} situación(es) accionable(s); resolver primero las marcadas como críticas o de revisión.`);
  }
  return insights.slice(0, 4);
}

export function buildStoreAgent(input: {
  generatedAt?: Date;
  primary: StoreAgentPeriod;
  week: StoreAgentPeriod;
  monthContext: StoreAgentPeriod;
  attention: StoreAgentAction[];
}): StoreAgentBrief {
  const attention = input.attention.sort(sortActions);
  return {
    mode: "store-agent-operational-v1",
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    primaryKpi: input.primary,
    monthContext: input.monthContext,
    weekContext: input.week,
    attention,
    quickActions: [
      { id: "kpis", label: "Capturar KPIs", detail: "Venta, tickets, piezas, tráfico y metas.", route: { type: "retool", path: "/kpis" } },
      { id: "quota", label: "Cuota Justa", detail: "Mínimos, porcentajes y RDS semanal.", route: { type: "retool", path: "/cuota-justa" } },
      { id: "kardex", label: "Kardex", detail: "Inventario, movimientos y rondas.", route: { type: "retool", path: "/kardex" } },
      { id: "attendance", label: "Asistencia", detail: "Retardos, faltas y justificantes.", route: { type: "retool", path: "/asistencia" } },
      { id: "schedule", label: "Horarios", detail: "Cobertura y solicitudes de cambio.", route: { type: "retool", path: "/horarios" } },
      { id: "electronic", label: "Ticket electrónico", detail: "Captura semanal de CRM/POS.", route: { type: "retool", path: "/ticket-electronico" } }
    ],
    insights: buildInsights({ primary: input.primary, week: input.week, monthContext: input.monthContext, attention }),
    dataSources: [
      {
        label: "KPIs",
        source: "Kpi",
        range: "Hoy, semana RDV, mes retail, periodo anterior comparable y último mes cerrado",
        formula: "Suma venta/meta/tickets/piezas; UPT, AUR, EPT y cumplimiento salen de esos totales."
      },
      {
        label: "Conversión",
        source: "Kpi.traffic",
        range: "Por fecha dentro del periodo",
        formula: "Tráfico de tienda = máximo diario capturado; conversión = tickets / tráfico."
      },
      {
        label: "Acciones",
        source: "Schedule, Attendance, Pending, InventoryRound, WeeklyPerformanceClose",
        range: "Solo tienda autenticada",
        formula: "Cada acción sale de estado real abierto o timestamp faltante; no se infiere por texto."
      }
    ]
  };
}
