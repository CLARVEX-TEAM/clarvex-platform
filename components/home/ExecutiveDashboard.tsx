"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowUpRight, BarChart3, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/StatusBadge";
import { money } from "@/lib/format";
import { getSession } from "@/lib/auth";

interface KpiFactsBlock {
  startDate: string;
  endDate: string;
  weekNumber: number | null;
  retailMonthLabel: string | null;
  store: {
    sales: number;
    goal: number;
    achievement: number;
    conversion: number | null;
    upt: number | null;
    traffic: number | null;
    transactions: number;
  } | null;
  team: Array<{
    name: string;
    achievement: number;
    conversion: number | null;
    sales: number;
    ranking: number;
  }>;
}

interface ExecutiveData {
  health: {
    storeHealth: "VERDE" | "AMARILLO" | "ROJO";
    fortheleses: string[];
    risks: string[];
    topAdvisor: string;
    opportunityAdvisor: string;
    priorities: string[];
    actions: string[];
    kpiFacts?: {
      asOf: string;
      month: KpiFactsBlock;
      week: KpiFactsBlock;
      day: KpiFactsBlock;
    };
  };
  predictions: {
    probabilityGoal: number;
    expectedCloseSales: number;
    salesRemaining: number;
    salesPerHourNeeded: number;
    probabilityCommission: number;
    details: string;
  };
  dailySummary?: {
    id: string;
    summaryDate: string;
    status: "PENDING" | "READY" | "NO_DATA" | "FAILED";
    content?: {
      summary: string;
      positives: string[];
      negatives: string[];
      actionPlanTomorrow: string[];
    };
    errorMessage?: string;
    generatedAt?: string;
  };
}

export function ExecutiveDashboard() {
  const [data, setData] = useState<ExecutiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState("");

  useEffect(() => {
    getSession().then((session) => {
      if (session) setUserRole(session.role);
    }).catch(() => {});

    fetch("/api/ai/executive")
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "No se pudo cargar el panel ejecutivo.");
        setData(payload);
      })
      .catch((err) => {
        setError(err.message || "Error al obtener datos ejecutivos de IA.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleRegenerate = async () => {
    if (!window.confirm("¿Estás seguro de que deseas regenerar el resumen con IA para el día anterior? Esto consumirá cuota de IA.")) {
      return;
    }
    setIsRegenerating(true);
    setRegenError("");
    try {
      const res = await fetch("/api/ai/daily-summary/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "No se pudo regenerar el resumen.");
      setData((prev) => prev ? { ...prev, dailySummary: payload } : null);
    } catch (err: any) {
      setRegenError(err.message || "Error al regenerar el resumen diario.");
    } finally {
      setIsRegenerating(false);
    }
  };

  const formatSummaryDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "UTC" });
    } catch {
      return "el día anterior";
    }
  };

  const formatGeneratedAt = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toLocaleString("es-MX", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
  };

  if (loading) {
    return (
      <GlassCard className="mt-3 animate-pulse p-4">
        <div className="flex items-center space-x-2">
          <Sparkles className="h-5 w-5 text-[#00FF66]" />
          <div className="h-4 w-40 rounded bg-white/20" />
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-6 w-full rounded bg-white/10" />
          <div className="h-4 w-5/6 rounded bg-white/10" />
          <div className="h-4 w-4/6 rounded bg-white/10" />
        </div>
      </GlassCard>
    );
  }

  if (error) {
    return (
      <GlassCard className="p-5 border border-amber-500/20 bg-amber-500/5">
        <div className="flex items-center gap-2 text-amber-400">
          <Sparkles size={18} />
          <h3 className="font-black text-sm">Dashboard IA Desconectado</h3>
        </div>
        <p className="mt-2 text-xs text-slate-400 leading-normal">
          El análisis operativo y predictivo por Inteligencia Artificial no pudo cargarse debido a que se alcanzó el límite de cuota de la API o la clave es inválida. Los datos tradicionales de la tienda siguen operando con total normalidad.
        </p>
      </GlassCard>
    );
  }

  if (!data) {
    return null;
  }

  const { health, predictions, dailySummary } = data;

  const healthColors = {
    VERDE: { bg: "bg-[#00FF66]/10 border-[#00FF66]/30 text-[#00FF66]", label: "Estable / Saludable" },
    AMARILLO: { bg: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400", label: "Precaución" },
    ROJO: { bg: "bg-rose-500/10 border-rose-500/30 text-rose-400", label: "Crítico / En Riesgo" },
  };

  const healthStyle = healthColors[health.storeHealth] || healthColors.VERDE;

  return (
    <GlassCard className="mt-3 p-5 border border-white/10 bg-[#0A0A0A]/60 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/5">
        <div className="flex items-center space-x-2">
          <Sparkles className="h-5 w-5 text-[#00FF66]" />
          <h3 className="font-black text-white text-base">Análisis Operativo IA</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${healthStyle.bg}`}>
          Salud: {health.storeHealth}
        </span>
      </div>

      {/* Main predictions */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[18px] bg-white/5 p-3 border border-white/5">
          <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Logro de Meta</p>
          <div className="mt-1 flex items-baseline space-x-1">
            <span className="text-2xl font-black text-white">{predictions.probabilityGoal}%</span>
            <span className="text-[10px] text-[#00FF66] flex items-center">
              <TrendingUp className="h-3 w-3 mr-0.5" />
              Prob
            </span>
          </div>
          <p className="mt-2 text-[10px] text-white/40 leading-snug">
            Cierre estimado: <strong className="text-white/80">{money(predictions.expectedCloseSales)}</strong>
          </p>
        </div>

        <div className="rounded-[18px] bg-white/5 p-3 border border-white/5">
          <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Comisión de Equipo</p>
          <div className="mt-1 flex items-baseline space-x-1">
            <span className="text-2xl font-black text-white">{predictions.probabilityCommission}%</span>
            <span className="text-[10px] text-blue-400 flex items-center">
              <ArrowUpRight className="h-3 w-3 mr-0.5" />
              Tasa
            </span>
          </div>
          <p className="mt-2 text-[10px] text-white/40 leading-snug">
            Requerido/hr: <strong className="text-white/80">{money(predictions.salesPerHourNeeded)}</strong>
          </p>
        </div>
      </div>

      {/* Datos KPIs (fuente de verdad — no los calcula la IA) */}
      {health.kpiFacts?.week && (
        <div className="mt-4 rounded-[18px] border border-[#00FF66]/15 bg-[#00FF66]/[0.04] p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-[#00FF66]">
              Datos KPIs · hasta {health.kpiFacts.asOf}
            </p>
            <span className="text-[10px] text-white/40">
              Semana{health.kpiFacts.week.weekNumber ? ` ${health.kpiFacts.week.weekNumber}` : ""}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-black/20 p-2">
              <p className="text-[9px] text-white/40 uppercase">Alcance</p>
              <p className="text-sm font-black text-white">
                {health.kpiFacts.week.store ? `${health.kpiFacts.week.store.achievement.toFixed(1)}%` : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-black/20 p-2">
              <p className="text-[9px] text-white/40 uppercase">Conversión</p>
              <p className="text-sm font-black text-white">
                {health.kpiFacts.week.store?.conversion != null ? `${health.kpiFacts.week.store.conversion.toFixed(1)}%` : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-black/20 p-2">
              <p className="text-[9px] text-white/40 uppercase">UPT</p>
              <p className="text-sm font-black text-white">
                {health.kpiFacts.week.store?.upt != null ? health.kpiFacts.week.store.upt.toFixed(2) : "—"}
              </p>
            </div>
          </div>
          {health.kpiFacts.week.team.length > 0 && (
            <ul className="space-y-1.5 pt-1 border-t border-white/5">
              {health.kpiFacts.week.team.slice(0, 5).map((advisor) => (
                <li key={advisor.name} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-white/80 truncate">
                    <span className="text-white/40 mr-1">#{advisor.ranking}</span>
                    {advisor.name}
                  </span>
                  <span className="shrink-0 text-white/50">
                    {advisor.achievement.toFixed(0)}% · conv {advisor.conversion != null ? `${advisor.conversion.toFixed(1)}%` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[9px] text-white/30 leading-snug">
            Mismos números que la pestaña KPIs. La IA solo interpreta; no recalcula.
          </p>
        </div>
      )}

      {/* Bullet Insights */}
      <div className="mt-4 space-y-3 text-xs text-white/80">
        {/* Risks */}
        {health.risks.length > 0 && (
          <div className="flex items-start space-x-2">
            <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-rose-400">Riesgos detectados:</span>
              <ul className="list-disc list-inside mt-1 space-y-1 text-white/70">
                {health.risks.map((risk, idx) => (
                  <li key={idx}>{risk}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Top/Opp Advisor */}
        <div className="flex items-start space-x-2 border-t border-white/5 pt-2.5">
          <AlertCircle className="h-4 w-4 text-[#00FF66] shrink-0 mt-0.5" />
          <div>
            <p className="leading-relaxed">
              <span className="font-bold text-[#00FF66]">Destacado:</span> {health.topAdvisor}
            </p>
            <p className="leading-relaxed mt-1 text-white/60">
              <span className="font-bold text-yellow-400">Oportunidad:</span> {health.opportunityAdvisor}
            </p>
          </div>
        </div>

        {/* Suggested Actions */}
        <div className="border-t border-white/5 pt-2.5 space-y-1">
          <span className="font-bold text-white">Prioridades de Acción sugeridas:</span>
          <ul className="list-decimal list-inside space-y-1 text-white/70 mt-1">
            {health.actions.map((act, idx) => (
              <li key={idx} className="leading-relaxed">{act}</li>
            ))}
          </ul>
        </div>

        {/* Resumen Diario IA */}
        {dailySummary && (
          <div className="mt-4 border-t border-white/5 pt-3.5 space-y-3.5 text-xs">
            <div className="flex items-center justify-between">
              <p className="font-black text-[#00FF66] flex items-center gap-1.5">
                <span>📋</span> Resumen del {formatSummaryDate(dailySummary.summaryDate)}:
              </p>
              {dailySummary.generatedAt && (
                <span className="text-[10px] text-white/30">
                  Generado: {formatGeneratedAt(dailySummary.generatedAt)}
                </span>
              )}
            </div>

            {/* Estado PENDING */}
            {dailySummary.status === "PENDING" && (
              <div className="animate-pulse py-4 space-y-2">
                <div className="h-4 w-full bg-white/10 rounded" />
                <div className="h-4 w-5/6 bg-white/10 rounded" />
                <div className="h-4 w-4/6 bg-white/10 rounded" />
                <p className="text-[10px] text-white/40 italic">Generando resumen con IA en tiempo real...</p>
              </div>
            )}

            {/* Estado NO_DATA */}
            {dailySummary.status === "NO_DATA" && (
              <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4 text-center">
                <p className="text-white/60">No hay datos suficientes del {formatSummaryDate(dailySummary.summaryDate)} para generar el resumen.</p>
              </div>
            )}

            {/* Estado FAILED */}
            {dailySummary.status === "FAILED" && (
              <div className="rounded-xl bg-rose-500/5 border border-rose-500/10 p-4 space-y-2.5">
                <p className="text-rose-400 font-semibold">No fue posible generar el resumen del {formatSummaryDate(dailySummary.summaryDate)}.</p>
                {dailySummary.errorMessage && (
                  <p className="text-[10px] text-white/40 leading-normal font-mono bg-black/30 p-2 rounded">
                    Detalle: {dailySummary.errorMessage}
                  </p>
                )}
                {(userRole === "GERENTE" || userRole === "SUBGERENTE") && (
                  <button
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                    className="w-full mt-2 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold border border-rose-500/25 transition disabled:opacity-50 text-[11px]"
                  >
                    {isRegenerating ? "Regenerando..." : "Intentar generar de nuevo"}
                  </button>
                )}
              </div>
            )}

            {/* Estado READY */}
            {dailySummary.status === "READY" && dailySummary.content && (
              <div className="space-y-3">
                <p className="text-white/70 leading-relaxed italic bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                  {dailySummary.content.summary}
                </p>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  {dailySummary.content.positives && dailySummary.content.positives.length > 0 && (
                    <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-2.5">
                      <span className="font-bold text-emerald-400">Éxitos:</span>
                      <ul className="list-disc list-inside mt-1 space-y-1 text-white/60 text-[11px]">
                        {dailySummary.content.positives.map((p, idx) => (
                          <li key={idx} className="leading-snug">{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {dailySummary.content.negatives && dailySummary.content.negatives.length > 0 && (
                    <div className="rounded-xl bg-rose-500/5 border border-rose-500/10 p-2.5">
                      <span className="font-bold text-rose-400">Oportunidades:</span>
                      <ul className="list-disc list-inside mt-1 space-y-1 text-white/60 text-[11px]">
                        {dailySummary.content.negatives.map((n, idx) => (
                          <li key={idx} className="leading-snug">{n}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {dailySummary.content.actionPlanTomorrow && dailySummary.content.actionPlanTomorrow.length > 0 && (
                  <div className="rounded-xl bg-[#00FF66]/5 border border-[#00FF66]/10 p-3 space-y-1.5">
                    <span className="font-bold text-[#00FF66]">Estrategia sugerida:</span>
                    <ul className="list-decimal list-inside space-y-1 text-white/70">
                      {dailySummary.content.actionPlanTomorrow.map((planText, idx) => (
                        <li key={idx} className="leading-relaxed">{planText}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Botón de Regeneración Manual para Gerentes/Subgerentes */}
                {(userRole === "GERENTE" || userRole === "SUBGERENTE") && (
                  <div className="flex flex-col gap-1 pt-1.5 border-t border-white/5">
                    <button
                      onClick={handleRegenerate}
                      disabled={isRegenerating}
                      className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/75 font-semibold border border-white/10 transition disabled:opacity-50 text-[11px]"
                    >
                      {isRegenerating ? "Regenerando resumen..." : "Regenerar resumen con IA"}
                    </button>
                    {regenError && (
                      <p className="text-[10px] text-rose-400 mt-1">{regenError}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
