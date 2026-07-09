"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowUpRight, BarChart3, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/StatusBadge";
import { money } from "@/lib/format";

interface ExecutiveData {
  health: {
    storeHealth: "VERDE" | "AMARILLO" | "ROJO";
    fortheleses: string[];
    risks: string[];
    topAdvisor: string;
    opportunityAdvisor: string;
    priorities: string[];
    actions: string[];
  };
  predictions: {
    probabilityGoal: number;
    expectedCloseSales: number;
    salesRemaining: number;
    salesPerHourNeeded: number;
    probabilityCommission: number;
    details: string;
  };
}

export function ExecutiveDashboard() {
  const [data, setData] = useState<ExecutiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
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

  if (error || !data) {
    return null; // Don't break layout if AI dashboard is not active
  }

  const { health, predictions } = data;

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
      </div>
    </GlassCard>
  );
}
