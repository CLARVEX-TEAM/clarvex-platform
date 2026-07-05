// Capa compartida (sin JSX) entre la vista móvil (app/kpis) y la de
// escritorio (app/escritorio/kpis). Tipos, constantes y cálculos derivados
// viven aquí para que un arreglo aplique a ambas versiones a la vez.
import { BarChart3, MessageCircle, Percent, Receipt, ShoppingBag, Target, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { findCommissionRule, resolveCommissionMinimum } from "@/lib/commission";
import { periodDateKey, type KpiPeriod } from "@/lib/kpi-period";
import type { KpiReportItem } from "@/lib/kpi-report";
import type { CommissionRule, Role } from "@/lib/types";

export type KpiTab = "resumen" | "ventas" | "comision" | "ranking" | "historico" | "recibo";
export type KpiTarget = { id: string; metric: string; value: number; period: string };
export type MonthProjection = { weeksElapsed: number; totalWeeks: number; projectedSales: number; projectedCommission: number; percent: number; achievement: number };
export type MonthSalesProjection = { weeksElapsed: number; totalWeeks: number; projectedSales: number; goal: number; achievement: number };
export type KpiResponse = {
  period: KpiPeriod;
  selectedDate: string;
  startDate: string;
  endDate: string;
  weekNumber: number | null;
  availableWeeks: Array<{ weekNumber: number; weekStart: string; weekEnd: string }>;
  availableRetailMonths: Array<{ label: string; start: string; end: string }>;
  retailMonthLabel: string | null;
  workedDays: number | null;
  currentUserId: string;
  role: Role;
  store: KpiReportItem | null;
  own: KpiReportItem | null;
  team: KpiReportItem[];
  commissionRules: CommissionRule[];
  hasDiscountSource: boolean;
  latestDiscountWeek: { weekNumber: number; margin: number | null } | null;
};

export interface MetricConfig {
  label: string;
  gradient: string;
  glow: string;
  Icon: LucideIcon;
  targetLabel: string;
}

export const METRIC_CONFIG: Record<string, MetricConfig> = {
  upt:         { label: "UPT",          gradient: "from-blue-500 to-blue-700",     glow: "rgba(59,130,246,0.32)",  Icon: ShoppingBag, targetLabel: "Meta UPT"           },
  aur:         { label: "AUR",          gradient: "from-sky-400 to-cyan-600",      glow: "rgba(14,165,233,0.32)",  Icon: Receipt,     targetLabel: "Meta AUR ($)"       },
  ept:         { label: "EPT",          gradient: "from-violet-500 to-purple-700", glow: "rgba(139,92,246,0.32)",  Icon: BarChart3,   targetLabel: "Meta EPT ($)"       },
  conversion:  { label: "Conversión",   gradient: "from-orange-400 to-amber-600",  glow: "rgba(251,146,60,0.32)",  Icon: Target,      targetLabel: "Meta Conversión (%)" },
  margen:      { label: "Margen DTO",   gradient: "from-rose-500 to-pink-700",     glow: "rgba(244,63,94,0.32)",   Icon: Percent,     targetLabel: "Límite DTO (%)"     },
  achievement: { label: "Cumplimiento", gradient: "from-emerald-500 to-teal-700",  glow: "rgba(16,185,129,0.32)",  Icon: TrendingUp,  targetLabel: "Meta cumplimiento (%)" },
  whatsapp:    { label: "WhatsApp",     gradient: "from-green-500 to-emerald-700", glow: "rgba(34,197,94,0.32)",   Icon: MessageCircle, targetLabel: "PPTO WhatsApp semanal ($)" },
};

// Acento por métrica para las tarjetas del sistema (móvil y escritorio): tinte
// en el chip del ícono y color de la sparkline. El valor va en tinta — el color
// señala la métrica, no compite con la cifra.
export const METRIC_ACCENT: Record<string, { chip: string; spark: string }> = {
  upt:         { chip: "bg-volt/10 text-volt",       spark: "#2563EB" },
  aur:         { chip: "bg-sky/10 text-sky",         spark: "#0EA5E9" },
  ept:         { chip: "bg-purple/10 text-purple",   spark: "#4F46E5" },
  conversion:  { chip: "bg-ember/10 text-ember",     spark: "#F59E0B" },
  margen:      { chip: "bg-orchid/10 text-orchid",   spark: "#EF4444" },
  achievement: { chip: "bg-success/10 text-success", spark: "#22C55E" }
};

export const KPI_TABS: { id: KpiTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "ventas", label: "Ventas" },
  { id: "comision", label: "Comisión" },
  { id: "ranking", label: "Ranking" },
  { id: "historico", label: "Histórico" },
  { id: "recibo", label: "Recibo" }
];

export type ReceiptLine = { name: string; photoUrl: string | null; sales: number; minimum: number; achievement: number; percent: number; commission: number; hasMinimum: boolean };
export type ReceiptMonth = { label: string; start: string; isCurrent: boolean; main: ReceiptLine; team: ReceiptLine[] };

// Mismo cálculo que la pestaña Comisión: alcance = venta ÷ mínimo, nivel por bracket.
// No modifica la lógica de comisión, sólo reutiliza los helpers existentes.
export function computeReceiptLine(scope: { userName?: string; photoUrl?: string | null; sales: number; goal: number; commissionMinimum: number | null }, role: Role, rules: CommissionRule[]): ReceiptLine {
  const minimum = resolveCommissionMinimum(scope.commissionMinimum, scope.goal);
  const hasMinimum = minimum > 0;
  const achievement = hasMinimum ? (scope.sales / minimum) * 100 : 0;
  const rule = hasMinimum ? findCommissionRule(rules, role, achievement) : undefined;
  const percent = rule?.commissionPercent ?? 0;
  return {
    name: scope.userName ?? "",
    photoUrl: scope.photoUrl ?? null,
    sales: scope.sales,
    minimum,
    achievement,
    percent,
    commission: hasMinimum ? scope.sales * (percent / 100) : 0,
    hasMinimum
  };
}

export function getAchievement(sales: number, goal: number) {
  return goal > 0 ? (sales / goal) * 100 : 0;
}

export function localDateKey(date: Date) {
  return periodDateKey(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())));
}

export function formatPeriodLabel(period: KpiPeriod, startValue: string, endValue: string, weekNumber: number | null, retailMonthLabel: string | null) {
  const start = new Date(`${startValue}T00:00:00Z`);
  const end = new Date(`${endValue}T00:00:00Z`);
  const startLabel = start.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
  const endLabel = end.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
  if (period === "month") return `${retailMonthLabel ?? "Mes retail"} · ${startLabel} - ${endLabel}`;
  return `Semana ${weekNumber ?? "RDV"} · ${startLabel} - ${endLabel}`;
}

// Semanas transcurridas del mes retail en curso (base de todas las proyecciones).
// Se cuenta por DÍAS y la semana en curso aporta su fracción: si solo se contaran
// semanas completas, en la última semana del mes la proyección sería igual a la
// venta actual (X/X) y dejaría de extrapolar.
export function computeMonthWeeks(report: KpiResponse | null, now = new Date()): { weeksElapsed: number; totalWeeks: number } | null {
  if (!report || report.period !== "month") return null;
  const start = new Date(`${report.startDate}T00:00:00Z`);
  let end = new Date(`${report.endDate}T00:00:00Z`);
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  if (todayUtc < start) return null; // solo el mes en curso
  const dayMs = 86_400_000;
  const detectedWeeks = Math.max(1, Math.ceil(((end.getTime() - start.getTime()) / dayMs + 1) / 7));
  let totalWeeks = detectedWeeks;

  if (todayUtc > end) {
    // Mes retail de 5 semanas cuya quinta semana aún no aparece: el RDV solo
    // trae filas hasta el último día con datos, así que la semana 5 no existe
    // para el sistema hasta que arranca. Si hoy cae en la semana inmediata
    // posterior al fin detectado, van 4 semanas detectadas y ningún otro mes
    // retail contiene la fecha de hoy, seguimos dentro de este mes: se
    // extiende el rango una semana en lugar de apagar la proyección.
    const todayKey = todayUtc.toISOString().slice(0, 10);
    const anotherMonthHasToday = report.availableRetailMonths.some((month) => month.start !== report.startDate && todayKey >= month.start && todayKey <= month.end);
    const withinFollowingWeek = todayUtc.getTime() - end.getTime() <= 6 * dayMs;
    if (detectedWeeks !== 4 || !withinFollowingWeek || anotherMonthHasToday) return null;
    totalWeeks = 5;
    end = new Date(end.getTime() + 7 * dayMs);
  }

  const daysElapsed = (Math.min(todayUtc.getTime(), end.getTime()) - start.getTime()) / dayMs + 1;
  // Piso de 1: en los primeros días del mes se proyecta como si hubiera una
  // semana completa para no extrapolar salvajemente con 2 o 3 días de datos.
  const weeksElapsed = Math.min(totalWeeks, Math.max(1, daysElapsed / 7));
  return { weeksElapsed, totalWeeks };
}

// "4.9/5" en las tarjetas de proyección: entero cuando es exacto, un decimal si no.
export function formatWeeksElapsed(weeks: number) {
  return Number.isInteger(weeks) ? String(weeks) : (Math.round(weeks * 10) / 10).toFixed(1);
}
