"use client";

// Hooks compartidos entre la vista móvil (app/kpis) y la de escritorio
// (app/escritorio/kpis). El fetch usa la versión robusta con reintentos
// (en iOS/PWA la petición a veces se cuelga al cambiar de pantalla).
import { useEffect, useMemo, useState } from "react";
import { commissionReference, findCommissionRule, projectMonthlyCommission, rulePayout, rulePercent } from "@/lib/commission";
import { completion } from "@/lib/format";
import type { KpiPeriod } from "@/lib/kpi-period";
import type { Role, User } from "@/lib/types";
import {
  computeMonthWeeks,
  computeReceiptLine,
  formatPeriodLabel,
  getAchievement,
  localDateKey,
  type KpiResponse,
  type KpiTab,
  type KpiTarget,
  type MonthProjection,
  type MonthSalesProjection,
  type ReceiptMonth
} from "@/lib/kpi-view";

export function useKpiReport({ session, period, selectedDate, setSelectedDate, refreshTick = 0, onLoaded }: {
  session: User | null;
  period: KpiPeriod;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  refreshTick?: number;
  onLoaded?: () => void;
}) {
  const [report, setReport] = useState<KpiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let activeController: AbortController | null = null;
    setLoading(true);
    setError("");
    (async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
        const controller = new AbortController();
        activeController = controller;
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
          const response = await fetch(`/api/kpis?period=${period}&date=${selectedDate}`, { cache: "no-store", signal: controller.signal });
          clearTimeout(timer);
          const payload = await response.json() as KpiResponse & { error?: string };
          if (!response.ok) throw new Error(payload.error ?? "No se pudieron cargar los KPIs.");
          if (cancelled) return;
          setReport(payload);
          if (period === "week" && payload.startDate !== selectedDate) setSelectedDate(payload.startDate);
          onLoaded?.();
          setLoading(false);
          return;
        } catch (requestError) {
          clearTimeout(timer);
          if (cancelled) return; // se cambió de pantalla / dependencias
          lastError = requestError;
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
      if (!cancelled) {
        setError(lastError instanceof Error ? lastError.message : "No se pudieron cargar los KPIs.");
        setLoading(false);
      }
    })();
    return () => { cancelled = true; activeController?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, selectedDate, session, refreshTick]);

  return { report, loading, error };
}

export function useKpiTargets(session: User | null) {
  const [targets, setTargets] = useState<KpiTarget[]>([]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/kpi-targets")
      .then((r) => r.json() as Promise<{ targets?: KpiTarget[] }>)
      .then((payload) => { if (payload.targets) setTargets(payload.targets); })
      .catch(() => undefined);
  }, [session]);

  return { targets, setTargets };
}

// Recibo histórico: un cierre de comisión por cada mes retail disponible. Reutiliza
// /api/kpis (mismo cálculo del período) y computa la comisión con los mismos helpers.
export function useKpiReceipts({ activeTab, session, report, period, selectedDate }: {
  activeTab: KpiTab;
  session: User | null;
  report: KpiResponse | null;
  period: KpiPeriod;
  selectedDate: string;
}) {
  const [receipts, setReceipts] = useState<ReceiptMonth[] | null>(null);
  const [receiptsLoading, setReceiptsLoading] = useState(false);

  // Reinicia recibos al cambiar de período para recalcularlos al abrir la pestaña.
  useEffect(() => { setReceipts(null); }, [period, selectedDate]);

  useEffect(() => {
    if (activeTab !== "recibo" || !session || !report || receipts !== null) return;
    const months = report.availableRetailMonths;
    if (months.length === 0) { setReceipts([]); return; }
    const manager = session.role !== "ASESOR";
    const todayKey = localDateKey(new Date());
    const controller = new AbortController();
    setReceiptsLoading(true);
    Promise.all(months.map((month) =>
      fetch(`/api/kpis?period=month&date=${month.start}`, { cache: "no-store", signal: controller.signal })
        .then((r) => r.json() as Promise<KpiResponse>)
        .then((payload): ReceiptMonth | null => {
          const scope = manager ? payload.store : payload.own;
          if (!scope) return null;
          const main = computeReceiptLine(scope, manager ? session.role : "ASESOR", payload.commissionRules);
          const team = manager
            ? payload.team.filter((item) => item.role === "ASESOR").map((item) => computeReceiptLine(item, "ASESOR", payload.commissionRules))
            : [];
          return { label: month.label, start: month.start, isCurrent: todayKey >= month.start && todayKey <= month.end, main, team };
        })
        .catch(() => null)
    ))
      .then((list) => {
        if (controller.signal.aborted) return;
        setReceipts(list.filter((month): month is ReceiptMonth => month !== null).sort((a, b) => b.start.localeCompare(a.start)));
      })
      .finally(() => { if (!controller.signal.aborted) setReceiptsLoading(false); });
    return () => controller.abort();
  }, [activeTab, session, report, receipts]);

  return { receipts, receiptsLoading };
}

// Todos los valores derivados del reporte (KPI activo, comisión simulada,
// proyecciones de mes retail). Idénticos en móvil y escritorio.
export function useKpiDerived({ session, report, period, targets, simulatedSales }: {
  session: User | null;
  report: KpiResponse | null;
  period: KpiPeriod;
  targets: KpiTarget[];
  simulatedSales: string;
}) {
  const isAdvisor = session?.role === "ASESOR";
  const isManager = !isAdvisor;
  const activeKpi = isAdvisor ? (report?.own ?? null) : (report?.store ?? null);
  const periodLabel = period === "week" ? "semanal" : "mensual";
  const progress = completion(activeKpi?.sales ?? 0, activeKpi?.goal ?? 0);
  const commissionKpi = isAdvisor ? (report?.own ?? null) : (report?.store ?? null);
  const initialSimulation = simulatedSales ? Number(simulatedSales) : commissionKpi?.sales ?? 0;
  // Referencia del alcance para comisión: el MÍNIMO en casi todas las marcas, y
  // la META en GUESS. Lo decide la tienda (`commissionBasis`), no esta pantalla:
  // con meta 268 974 y un 90 %, medir contra el mínimo lo convierte en 103 % y
  // cambia de bracket. Sin mínimo sincronizado se deriva de la meta (meta ÷ 1.15).
  const commissionBase = commissionReference({
    goal: commissionKpi?.goal ?? 0,
    minimum: commissionKpi?.commissionMinimum ?? null,
    basis: report?.commissionBasis
  });
  const hasCommissionMinimum = commissionBase > 0;
  const simulatedAchievement = hasCommissionMinimum ? getAchievement(initialSimulation, commissionBase) : 0;
  const commissionRole: Role = isAdvisor ? "ASESOR" : session?.role ?? "GERENTE";
  const activeRule = hasCommissionMinimum ? findCommissionRule(report?.commissionRules ?? [], commissionRole, simulatedAchievement) : undefined;
  const appliedPercent = rulePercent(activeRule);
  // Con `rulePayout` y no venta × %, porque los brackets de GUESS entre 80 y
  // 99.99 % pagan un IMPORTE FIJO: multiplicar por su porcentaje (0) daría cero.
  const simulatedCommission = hasCommissionMinimum ? rulePayout(activeRule, initialSimulation) : 0;
  const chartData = report?.team.map((item) => ({ name: item.userName, venta: item.sales, meta: item.goal })) ?? [];
  const rangeLabel = report ? formatPeriodLabel(report.period, report.startDate, report.endDate, report.weekNumber, report.retailMonthLabel) : "Cargando periodo";
  const periodKey: "SEMANA" | "MES" = period === "week" ? "SEMANA" : "MES";
  const periodTargets = useMemo(() => targets.filter((t) => t.period === periodKey), [targets, periodKey]);

  const monthWeeks = useMemo(() => computeMonthWeeks(report), [report]);

  // Proyección de COMISIÓN (pestaña Comisión). Reutiliza projectMonthlyCommission.
  const monthProjection = useMemo<MonthProjection | null>(() => {
    if (!monthWeeks || !report || !commissionKpi || commissionKpi.sales <= 0) return null;
    const result = projectMonthlyCommission({
      salesToDate: commissionKpi.sales,
      minimumToDate: commissionReference({
        goal: commissionKpi.goal,
        minimum: commissionKpi.commissionMinimum ?? null,
        basis: report.commissionBasis
      }),
      weeksElapsed: monthWeeks.weeksElapsed,
      totalWeeks: monthWeeks.totalWeeks,
      rules: report.commissionRules,
      role: commissionRole
    });
    return result ? { ...monthWeeks, ...result } : null;
  }, [monthWeeks, report, commissionKpi, commissionRole]);

  // Proyección de VENTA de cierre de mes de TIENDA (pestaña Resumen, solo gerencia).
  // La meta mensual de tienda viene completa (TOTALES), así que se compara directo.
  const monthSalesProjection = useMemo<MonthSalesProjection | null>(() => {
    if (!monthWeeks || !isManager || !activeKpi || activeKpi.sales <= 0 || activeKpi.goal <= 0) return null;
    const projectedSales = (activeKpi.sales / monthWeeks.weeksElapsed) * monthWeeks.totalWeeks;
    const achievement = Math.round((projectedSales / activeKpi.goal) * 100);
    return { ...monthWeeks, projectedSales, goal: activeKpi.goal, achievement };
  }, [monthWeeks, isManager, activeKpi]);

  return {
    isAdvisor, isManager, activeKpi, periodLabel, progress, commissionKpi,
    hasCommissionMinimum, simulatedAchievement, commissionRole, activeRule,
    appliedPercent, simulatedCommission, chartData, rangeLabel, periodKey,
    periodTargets, monthProjection, monthSalesProjection
  };
}
