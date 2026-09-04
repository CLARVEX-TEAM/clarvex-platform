import type { ManagerDashboardMetric } from "@/lib/retool-manager-dashboard";
import type { StoreAgentAction, StoreAgentRoute } from "@/lib/retool-store-agent";

export type StoreAuditSeverity = "critical" | "warning" | "info";

export type StoreAuditAnomaly = {
  severity: StoreAuditSeverity;
  title: string;
  detail: string;
  recommendation: string;
  source: "KPIS" | "ASISTENCIA" | "PENDIENTES" | "KARDEX" | "CUOTA_JUSTA" | "HORARIOS";
  count?: number;
  action?: {
    label: string;
    route: StoreAgentRoute;
    status?: string;
    period?: { start: string; end: string; label: string };
  };
};

export type StoreAuditBrief = {
  mode: "store-deterministic-brief";
  generatedAt: string;
  storeId: string;
  storeName: string;
  summary: {
    score: number;
    status: "ok" | "review" | "attention";
    critical: number;
    warning: number;
    info: number;
  };
  anomalies: StoreAuditAnomaly[];
  guardrails: string[];
};

function pushIf(condition: boolean, list: StoreAuditAnomaly[], anomaly: StoreAuditAnomaly) {
  if (condition) list.push(anomaly);
}

function sortAnomalies(left: StoreAuditAnomaly, right: StoreAuditAnomaly): number {
  const rank: Record<StoreAuditSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return rank[left.severity] - rank[right.severity] || left.title.localeCompare(right.title, "es");
}

export function buildStoreAudit(input: {
  generatedAt?: Date;
  store: { id: string; name: string; kpisEnabled: boolean };
  today: ManagerDashboardMetric;
  /**
   * El mes retail COMPLETO, con su meta total.
   *
   * ⚠️ Su `achievement` es contra la meta del mes entero. Sirve para mostrar
   * cuánto falta del objetivo, NO para juzgar si la tienda va atrasada: al
   * principio del mes va a ser bajo por construcción. Para eso está
   * `monthPace`.
   */
  month: ManagerDashboardMetric;
  /**
   * El acumulado hasta la fecha y la meta que le corresponde.
   *
   * Opcional para no romper a quien todavía no lo pase: sin él, la anomalía de
   * ritmo simplemente no se emite. Preferible a emitirla con el número
   * equivocado.
   */
  monthPace?: {
    salesToDate: number;
    /** Meta acumulada de los días transcurridos, no la del mes entero. */
    goalToDate: number;
    elapsedDays: number;
    totalDays: number;
    capturedDays: number;
  };
  latestKpiDate: string | null;
  daysSinceKpi: number | null;
  todayKpiRows: number;
  activeAdvisors: number;
  workingToday: number;
  attendanceIssues: number;
  highPriorityPendings: number;
  pendingShiftRequests: number;
  openInventoryRounds: number;
  draftWeeklyCloses?: number;
  weeklyPerformanceActions?: StoreAgentAction[];
  advisorsWorkingWithoutGoal: number;
}): StoreAuditBrief {
  const anomalies: StoreAuditAnomaly[] = [];
  const todayAchievement = input.today.achievement;

  pushIf(input.store.kpisEnabled && input.todayKpiRows === 0, anomalies, {
    severity: "warning",
    title: "Sin KPIs capturados hoy",
    detail: "Inicio no encontró filas de KPI para la fecha operativa actual.",
    recommendation: "Capturar KPIs antes del cierre para que ranking, metas y kardex no queden ciegos.",
    source: "KPIS",
    action: { label: "Abrir KPIs", route: { type: "retool", path: "/kpis" } }
  });
  pushIf(input.store.kpisEnabled && input.daysSinceKpi !== null && input.daysSinceKpi > 2, anomalies, {
    severity: "critical",
    title: "Captura atrasada",
    detail: `La última captura de KPI fue ${input.latestKpiDate ?? "sin fecha"} (${input.daysSinceKpi} días).`,
    recommendation: "Revisar qué días faltan y capturarlos antes de tomar decisiones con ventas acumuladas.",
    source: "KPIS",
    action: { label: "Abrir KPIs", route: { type: "retool", path: "/kpis" } }
  });
  pushIf(input.todayKpiRows > 0 && input.today.traffic === null, anomalies, {
    severity: "warning",
    title: "Tráfico sin capturar",
    detail: "Hay venta o metas del día, pero no hay tráfico de tienda.",
    recommendation: "Capturar tráfico para que conversión y EPT representen la operación real.",
    source: "KPIS",
    action: { label: "Capturar tráfico", route: { type: "retool", path: "/kpis" } }
  });
  pushIf(todayAchievement !== null && input.today.goal > 0 && todayAchievement < 70, anomalies, {
    severity: "critical",
    title: "Venta diaria muy por debajo",
    detail: `La tienda va en ${todayAchievement?.toFixed(1)} % de la meta diaria.`,
    recommendation: "Abrir seguimiento con acciones de piso y revisar tickets, piezas y conversión.",
    source: "KPIS",
    action: { label: "Abrir KPIs", route: { type: "retool", path: "/kpis" } }
  });
  pushIf(
    todayAchievement !== null && input.today.goal > 0 && todayAchievement >= 70 && todayAchievement < 90,
    anomalies,
    {
      severity: "warning",
      title: "Venta diaria por debajo",
      detail: `La tienda va en ${todayAchievement?.toFixed(1)} % de la meta diaria.`,
      recommendation: "Revisar el plan del día y reforzar a quien tenga brecha contra meta.",
      source: "KPIS",
      action: { label: "Abrir KPIs", route: { type: "retool", path: "/kpis" } }
    }
  );
  /*
   * ⚠️ **El ritmo se mide contra la meta de los días TRANSCURRIDOS, no contra
   * la del mes entero.**
   *
   * La versión anterior comparaba lo vendido contra la meta completa del mes,
   * así que el día 2 de un mes retail de treinta y cinco el avance era ~6 % y
   * la anomalía saltaba siempre. Estar por debajo del 85 % de la meta TOTAL al
   * principio del mes no demuestra atraso: demuestra que el mes acaba de
   * empezar.
   *
   * `monthPace` viene del acumulado hasta la fecha, con su propia meta
   * acumulada. Si falta, no se inventa: la anomalía no se emite.
   */
  const ritmo = input.monthPace;
  const ritmoPct = ritmo && ritmo.goalToDate > 0 ? (ritmo.salesToDate / ritmo.goalToDate) * 100 : null;

  /*
   * ⚠️ Y con captura incompleta NO se afirma atraso. Un día sin capturar baja
   * la venta acumulada y deja la meta igual, así que un hueco de captura se
   * lee exactamente igual que una caída de venta. Se dice lo que se sabe: que
   * falta capturar.
   */
  const capturaCompleta = ritmo ? ritmo.capturedDays >= ritmo.elapsedDays : false;

  pushIf(ritmoPct !== null && capturaCompleta && ritmoPct < 85, anomalies, {
    severity: "info",
    title: "Mes por debajo del ritmo",
    detail:
      `Van ${ritmoPct?.toFixed(1)} % de la meta de los ${ritmo?.elapsedDays} días transcurridos ` +
      `(de ${ritmo?.totalDays} del mes retail).`,
    recommendation: "Usarlo como contexto para ajustar foco semanal, sin cambiar comisiones ni metas desde este panel.",
    source: "KPIS",
    action: { label: "Ver acumulado", route: { type: "retool", path: "/kpis" } }
  });

  pushIf(ritmo !== undefined && ritmo.elapsedDays > 0 && !capturaCompleta, anomalies, {
    severity: "warning",
    title: "Faltan días por capturar en el mes",
    detail:
      `Hay captura en ${ritmo?.capturedDays} de los ${ritmo?.elapsedDays} días transcurridos. ` +
      "El acumulado del mes está incompleto y el ritmo no se puede afirmar.",
    recommendation: "Capturar los días faltantes antes de leer el avance mensual como resultado de la tienda.",
    source: "KPIS",
    action: { label: "Abrir KPIs", route: { type: "retool", path: "/kpis" } }
  });
  pushIf(input.workingToday === 0 && input.activeAdvisors > 0, anomalies, {
    severity: "warning",
    title: "Horario de hoy vacío",
    detail: "Hay asesores activos, pero Inicio no detectó personal laborando hoy.",
    recommendation: "Confirmar si el horario fue capturado o si la tienda no opera hoy.",
    source: "HORARIOS",
    action: { label: "Abrir horarios", route: { type: "retool", path: "/horarios" } }
  });
  pushIf(input.advisorsWorkingWithoutGoal > 0, anomalies, {
    severity: "info",
    title: "Personal laborando sin meta",
    detail: `${input.advisorsWorkingWithoutGoal} persona(s) laboran hoy sin meta capturada.`,
    recommendation: "Completar metas para que el ranking no castigue ni oculte desempeño.",
    source: "KPIS",
    count: input.advisorsWorkingWithoutGoal,
    action: { label: "Completar metas", route: { type: "retool", path: "/kpis" } }
  });
  pushIf(input.attendanceIssues > 0, anomalies, {
    severity: "warning",
    title: "Incidencias de asistencia abiertas",
    detail: `${input.attendanceIssues} incidencia(s) de asistencia aparecen en la cola de atención.`,
    recommendation: "Revisar retardos, faltas o justificantes antes de cerrar el día.",
    source: "ASISTENCIA",
    count: input.attendanceIssues,
    action: { label: "Abrir asistencia", route: { type: "retool", path: "/asistencia" } }
  });
  pushIf(input.highPriorityPendings > 0, anomalies, {
    severity: "warning",
    title: "Pendientes altos abiertos",
    detail: `${input.highPriorityPendings} pendiente(s) de prioridad alta o crítica siguen abiertos.`,
    recommendation: "Asignar responsable y fecha límite desde Clarvex.",
    source: "PENDIENTES",
    count: input.highPriorityPendings,
    action: { label: "Abrir pendientes", route: { type: "clarvex", path: "/pendientes" } }
  });
  pushIf(input.pendingShiftRequests > 0, anomalies, {
    severity: "info",
    title: "Solicitudes por aprobar",
    detail: `${input.pendingShiftRequests} solicitud(es) de horario siguen pendientes.`,
    recommendation: "Resolverlas antes de que afecten asistencia o cobertura.",
    source: "HORARIOS",
    count: input.pendingShiftRequests,
    action: { label: "Abrir horarios", route: { type: "retool", path: "/horarios" } }
  });
  pushIf(input.openInventoryRounds > 0, anomalies, {
    severity: "info",
    title: "Ronda de kardex abierta",
    detail: `${input.openInventoryRounds} ronda(s) de inventario siguen abiertas.`,
    recommendation: "Mantener movimientos al día; cerrar solo cuando el conteo esté confirmado.",
    source: "KARDEX",
    count: input.openInventoryRounds,
    action: { label: "Abrir kardex", route: { type: "retool", path: "/kardex" } }
  });
  if (input.weeklyPerformanceActions) {
    for (const action of input.weeklyPerformanceActions) {
      anomalies.push({
        severity: action.severity,
        title: action.title,
        detail: action.detail,
        recommendation: "Abrir la pantalla correspondiente y guardar únicamente lo que falta.",
        source: "CUOTA_JUSTA",
        count: action.count,
        action: {
          label: action.label,
          route: action.route,
          status: action.status,
          period: action.period
        }
      });
    }
  } else {
    pushIf((input.draftWeeklyCloses ?? 0) > 0, anomalies, {
      severity: "warning",
      title: "Cuota Justa en borrador",
      detail: `${input.draftWeeklyCloses ?? 0} cierre(s) semanal(es) vencidos siguen como borrador.`,
      recommendation: "Revisar Cuota Justa/RDS y guardar el cierre correcto.",
      source: "CUOTA_JUSTA",
      count: input.draftWeeklyCloses,
      action: { label: "Abrir Cuota Justa", route: { type: "retool", path: "/cuota-justa" } }
    });
  }

  const sorted = anomalies.sort(sortAnomalies);
  const critical = sorted.filter((item) => item.severity === "critical").length;
  const warning = sorted.filter((item) => item.severity === "warning").length;
  const info = sorted.filter((item) => item.severity === "info").length;
  const score = Math.max(0, 100 - critical * 25 - warning * 10 - info * 4);

  return {
    mode: "store-deterministic-brief",
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    storeId: input.store.id,
    storeName: input.store.name,
    summary: {
      score,
      status: critical > 0 ? "attention" : warning > 0 ? "review" : "ok",
      critical,
      warning,
      info
    },
    anomalies: sorted,
    guardrails: [
      "Solo usa datos de la tienda autenticada.",
      "No cambia metas, roles, asistencia, kardex ni cierres.",
      "Las recomendaciones son contexto para gerencia; cualquier correccion se hace en su pantalla normal."
    ]
  };
}
