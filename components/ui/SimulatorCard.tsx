"use client";

import { useState } from "react";
import { Sparkles, TrendingUp } from "lucide-react";
import { buildCommissionSimulation } from "@/lib/commission";
import { money } from "@/lib/format";
import type { CommissionRule, Role } from "@/lib/types";

interface SimulatorCardProps {
  /** Venta, meta y mínimo DEL MISMO periodo (por defecto, el mes retail). */
  sales: number;
  goal: number;
  minimum?: number | null;
  rules: CommissionRule[];
  role: Role;
  /** Periodo al que corresponden las cifras, para las etiquetas. */
  periodLabel?: string;
}

export function SimulatorCard({
  sales,
  goal,
  minimum,
  rules,
  role,
  periodLabel = "mes",
}: SimulatorCardProps) {
  // null = el usuario no ha movido el deslizador, así que sigue a la venta real
  // (que cambia al refrescar el dashboard).
  const [moved, setMoved] = useState<number | null>(null);

  const { sliderMin, sliderMax, simulatedSales, real, simulated, salesToSimulated, extraCommissionVsReal, gap } = buildCommissionSimulation({
    sales,
    goal,
    minimum,
    rules,
    role,
    simulatedSales: moved ?? undefined,
  });

  const fill = sliderMax > sliderMin ? ((simulatedSales - sliderMin) / (sliderMax - sliderMin)) * 100 : 0;

  return (
    <div className="rounded-[28px] bg-black/60 border border-white/8 backdrop-blur-xl p-5 text-white">
      {/* Cabecera */}
      <div className="flex items-center justify-between border-b border-white/8 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-[#00FF66]" size={20} />
          <h3 className="text-base font-semibold tracking-tight">Simulador de Comisión</h3>
        </div>
        <span className="text-[10px] font-bold bg-[#00FF66]/10 text-[#00FF66] border border-[#00FF66]/20 rounded-full px-2.5 py-0.5 uppercase tracking-wider">
          {periodLabel}
        </span>
      </div>

      {/* Grid de Estado Real */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white/3 border border-white/4 rounded-2xl p-3.5">
          <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Venta del {periodLabel}</p>
          <p className="text-lg font-semibold mt-1 text-white">{money(sales)}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-xs font-bold text-[#00FF66]">{real.percent}%</span>
            <span className="text-[10px] text-muted font-semibold">tasa comisión</span>
          </div>
        </div>

        <div className="bg-white/3 border border-white/4 rounded-2xl p-3.5">
          <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Comisión actual</p>
          <p className="text-lg font-semibold mt-1 text-[#00FF66]">{money(real.amount)}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-xs font-bold text-white">{Math.round(real.achievement)}%</span>
            <span className="text-[10px] text-muted font-semibold">alcance vs mínimo</span>
          </div>
        </div>
      </div>

      {/* Control Deslizante (Slider) */}
      <div className="space-y-3 bg-white/2 border border-white/4 rounded-2xl p-4 mb-4">
        <div className="flex justify-between items-center text-sm">
          <span className="font-bold text-muted">Simular venta del {periodLabel}:</span>
          <span className="font-semibold text-[#00FF66] text-base">{money(simulatedSales)}</span>
        </div>

        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={500}
          value={simulatedSales}
          onChange={(e) => setMoved(Number(e.target.value))}
          aria-label={`Venta simulada del ${periodLabel}`}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-panel accent-[#00FF66] focus:outline-hidden"
          style={{
            background: `linear-gradient(to right, #00FF66 0%, #00FF66 ${fill}%, #1e293b ${fill}%, #1e293b 100%)`
          }}
        />

        <div className="flex justify-between text-[10px] text-muted font-bold uppercase tracking-wider">
          <span>Actual ({money(sales)})</span>
          <span>Tope ({money(sliderMax)})</span>
        </div>
      </div>

      {/* Resultados de Simulación */}
      <div className="bg-linear-to-br from-black/80 to-white/2 border border-[#00FF66]/20 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted font-semibold">
            <span>Comisión Simulada:</span>
          </div>
          <span className="text-lg font-semibold text-[#00FF66]">{money(simulated.amount)}</span>
        </div>

        <div className="flex items-center justify-between border-t border-white/8 pt-2 text-xs">
          <span className="text-muted">Tasa Simulada:</span>
          <span className="font-bold text-white">{simulated.percent}%</span>
        </div>

        {salesToSimulated > 0 && (
          <div className="border-t border-white/8 pt-2 text-xs leading-normal">
            <p className="text-muted">
              Te faltan <span className="font-semibold text-white">{money(salesToSimulated)}</span> para llegar a esta venta,
            </p>
            <p className="text-muted mt-0.5">
              y te llevarías <span className="font-semibold text-[#00FF66]">+{money(extraCommissionVsReal)}</span> más de comisión que ahora.
            </p>
          </div>
        )}

        {gap && !gap.atTop && (
          <div className="bg-[#00FF66]/5 border border-[#00FF66]/10 rounded-xl p-3 mt-2 flex items-start gap-2.5">
            <Sparkles className="text-[#00FF66] shrink-0 mt-0.5" size={14} />
            <div className="text-xs leading-normal">
              <span className="font-bold text-muted">¡Próximo nivel al alcanzar el {gap.targetAchievement}%!</span>
              <p className="text-muted mt-0.5">
                Vende <span className="font-semibold text-white">{money(gap.salesNeeded)}</span> adicionales para subir tu tasa al <span className="font-semibold text-[#00FF66]">{gap.nextPercent}%</span> y sumar <span className="font-semibold text-[#00FF66]">+{money(gap.extraCommission)}</span> extra de comisión.
              </p>
            </div>
          </div>
        )}

        {gap?.atTop && (
          <div className="bg-volt/10 border border-volt/20 rounded-xl p-3 mt-2 flex items-start gap-2.5">
            <Sparkles className="text-volt shrink-0 mt-0.5" size={14} />
            <div className="text-xs leading-normal">
              <span className="font-bold text-muted">¡Nivel Máximo Alcanzado!</span>
              <p className="text-muted mt-0.5">
                Estás en la tasa de comisión más alta del <span className="font-semibold text-[#00FF66]">{gap.currentPercent}%</span>. ¡Excelente trabajo en piso de venta!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
