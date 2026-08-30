import type { ManagerDashboardMetric } from "@/lib/retool-manager-dashboard";

export type StoreAuditSeverity = "critical" | "warning" | "info";

export type StoreAuditAnomaly = {
  severity: StoreAuditSeverity;
  title: string;
  detail: string;
  recommendation: string;
  source: "KPIS" | "ASISTENCIA" | "PENDIENTES" | "KARDEX" | "CUOTA_JUSTA" | "HORARIOS";
  count?: number;
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
  month: ManagerDashboardMetric;
  latestKpiDate: string | null;
  daysSinceKpi: number | null;
  todayKpiRows: number;
  activeAdvisors: number;
  workingToday: number;
  attendanceIssues: number;
  highPriorityPendings: number;
  pendingShiftRequests: number;
  openInventoryRounds: number;
  draftWeeklyCloses: number;
  advisorsWorkingWithoutGoal: number;
}): StoreAuditBrief {
  const anomalies: StoreAuditAnomaly[] = [];
  const todayAchievement = input.today.achievement;
  const monthAchievement = input.month.achievement;

  pushIf(input.store.kpisEnabled && input.todayKpiRows === 0, anomalies, {
    severity: "warning",
    title: "Sin KPIs capturados hoy",
    detail: "Inicio no encontró filas de KPI para la fecha operativa actual.",
    recommendation: "Capturar KPIs antes del cierre para que ranking, metas y kardex no queden ciegos.",
    source: "KPIS"
  });
  pushIf(input.store.kpisEnabled && input.daysSinceKpi !== null && input.daysSinceKpi > 2, anomalies, {
    severity: "critical",
    title: "Captura atrasada",
    detail: `La última captura de KPI fue ${input.latestKpiDate ?? "sin fecha"} (${input.daysSinceKpi} días).`,
    recommendation: "Revisar qué días faltan y capturarlos antes de tomar decisiones con ventas acumuladas.",
    source: "KPIS"
  });
  pushIf(input.todayKpiRows > 0 && input.today.traffic === null, anomalies, {
    severity: "warning",
    title: "Tráfico sin capturar",
    detail: "Hay venta o metas del día, pero no hay tráfico de tienda.",
    recommendation: "Capturar tráfico para que conversión y EPT representen la operación real.",
    source: "KPIS"
  });
  pushIf(todayAchievement !== null && input.today.goal > 0 && todayAchievement < 70, anomalies, {
    severity: "critical",
    title: "Venta diaria muy por debajo",
    detail: `La tienda va en ${todayAchievement?.toFixed(1)} % de la meta diaria.`,
    recommendation: "Abrir seguimiento con acciones de piso y revisar tickets, piezas y conversión.",
    source: "KPIS"
  });
  pushIf(
    todayAchievement !== null && input.today.goal > 0 && todayAchievement >= 70 && todayAchievement < 90,
    anomalies,
    {
      severity: "warning",
      title: "Venta diaria por debajo",
      detail: `La tienda va en ${todayAchievement?.toFixed(1)} % de la meta diaria.`,
      recommendation: "Revisar el plan del día y reforzar a quien tenga brecha contra meta.",
      source: "KPIS"
    }
  );
  pushIf(monthAchievement !== null && input.month.goal > 0 && monthAchievement < 85, anomalies, {
    severity: "info",
    title: "Mes por debajo del ritmo",
    detail: `El avance mensual está en ${monthAchievement?.toFixed(1)} %.`,
    recommendation: "Usarlo como contexto para ajustar foco semanal, sin cambiar comisiones ni metas desde este panel.",
    source: "KPIS"
  });
  pushIf(input.workingToday === 0 && input.activeAdvisors > 0, anomalies, {
    severity: "warning",
    title: "Horario de hoy vacío",
    detail: "Hay asesores activos, pero Inicio no detectó personal laborando hoy.",
    recommendation: "Confirmar si el horario fue capturado o si la tienda no opera hoy.",
    source: "HORARIOS"
  });
  pushIf(input.advisorsWorkingWithoutGoal > 0, anomalies, {
    severity: "info",
    title: "Personal laborando sin meta",
    detail: `${input.advisorsWorkingWithoutGoal} persona(s) laboran hoy sin meta capturada.`,
    recommendation: "Completar metas para que el ranking no castigue ni oculte desempeño.",
    source: "KPIS",
    count: input.advisorsWorkingWithoutGoal
  });
  pushIf(input.attendanceIssues > 0, anomalies, {
    severity: "warning",
    title: "Incidencias de asistencia abiertas",
    detail: `${input.attendanceIssues} incidencia(s) de asistencia aparecen en la cola de atención.`,
    recommendation: "Revisar retardos, faltas o justificantes antes de cerrar el día.",
    source: "ASISTENCIA",
    count: input.attendanceIssues
  });
  pushIf(input.highPriorityPendings > 0, anomalies, {
    severity: "warning",
    title: "Pendientes altos abiertos",
    detail: `${input.highPriorityPendings} pendiente(s) de prioridad alta o crítica siguen abiertos.`,
    recommendation: "Asignar responsable y fecha límite desde Clarvex.",
    source: "PENDIENTES",
    count: input.highPriorityPendings
  });
  pushIf(input.pendingShiftRequests > 0, anomalies, {
    severity: "info",
    title: "Solicitudes por aprobar",
    detail: `${input.pendingShiftRequests} solicitud(es) de horario siguen pendientes.`,
    recommendation: "Resolverlas antes de que afecten asistencia o cobertura.",
    source: "HORARIOS",
    count: input.pendingShiftRequests
  });
  pushIf(input.openInventoryRounds > 0, anomalies, {
    severity: "info",
    title: "Ronda de kardex abierta",
    detail: `${input.openInventoryRounds} ronda(s) de inventario siguen abiertas.`,
    recommendation: "Mantener movimientos al día; cerrar solo cuando el conteo esté confirmado.",
    source: "KARDEX",
    count: input.openInventoryRounds
  });
  pushIf(input.draftWeeklyCloses > 0, anomalies, {
    severity: "warning",
    title: "Cuota Justa en borrador",
    detail: `${input.draftWeeklyCloses} cierre(s) semanal(es) vencidos siguen como borrador.`,
    recommendation: "Revisar Cuota Justa/RDS y guardar el cierre correcto.",
    source: "CUOTA_JUSTA",
    count: input.draftWeeklyCloses
  });

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
