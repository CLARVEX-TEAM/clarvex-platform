"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Badge, Card, ProgressBar } from "@/components/ui";
import { accruedCommission, type CommissionBasis } from "@/lib/commission";
import { completion, money, performanceTextClass } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CommissionRule, Role } from "@/lib/types";
import type { KpiReportItem } from "@/lib/kpi-report";

/**
 * Desempeño individual de gerencia + comisión.
 *
 * ⚠️ Regla de la tienda (protegida): gerente y subgerente comisionan sobre la
 * VENTA DE TIENDA (TOTALES), no sobre su venta individual (los asesores sí es
 * individual). Por eso la venta/meta que se muestran son las INDIVIDUALES (para
 * su seguimiento personal), pero la COMISIÓN se calcula con la venta y el mínimo
 * de TIENDA que trae /api/kpis (report.store). Solo lee el cálculo aprobado.
 */

type Props = {
  role: Role;
  /** Individuales (de app-data): su columna del RDV. */
  dailySales: number;
  dailyGoal: number;
  monthlySales: number;
  monthlyGoal: number;
};

/** "YYYY-MM-DD" en hora local, igual que la pestaña KPIs. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ManagerPerformanceCard({ role, dailySales, dailyGoal, monthlySales, monthlyGoal }: Props) {
  const [store, setStore] = useState<KpiReportItem | null>(null);
  const [rules, setRules] = useState<CommissionRule[] | null>(null);
  // Se asume MINIMO hasta saber lo contrario: es la base del resto de marcas.
  const [basis, setBasis] = useState<CommissionBasis>("MINIMO");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/kpis?period=month&date=${todayKey()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const payload = (await res.json()) as { store: KpiReportItem | null; commissionRules: CommissionRule[]; commissionBasis?: CommissionBasis };
        if (!cancelled) { setStore(payload.store); setRules(payload.commissionRules); setBasis(payload.commissionBasis ?? "MINIMO"); }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dayProgress = completion(dailySales, dailyGoal);
  const monthAlcance = completion(monthlySales, monthlyGoal);

  const commission = store && rules
    ? accruedCommission({ sales: store.sales, goal: store.goal, minimum: store.commissionMinimum, rules, role, basis })
    : null;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="text-muted" size={18} />
          <h2 className="text-[15px] font-semibold">Tu desempeño individual</h2>
        </div>
        <Badge tone="default">Gerencia</Badge>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Tu venta hoy</p>
          <p className="mt-1 text-2xl font-semibold leading-none text-ink">{money(dailySales)}</p>
          <p className="mt-1 text-xs text-muted">Meta {money(dailyGoal)}</p>
        </div>
        <span className={cn("text-[15px] font-semibold tabular-nums", performanceTextClass(dayProgress))}>{dayProgress}%</span>
      </div>
      <div className="mt-2"><ProgressBar value={dayProgress} /></div>

      <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3 text-sm">
        <Metric label="Meta mes" value={money(monthlyGoal)} />
        <Metric label="Venta mes" value={money(monthlySales)} />
        <Metric label="Alcance" value={`${monthAlcance}%`} />
      </div>

      {/* Comisión: para gerencia se calcula SOBRE LA VENTA DE TIENDA. */}
      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-3.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Tu comisión del mes</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {failed
              ? "No se pudo cargar la venta de tienda."
              : !commission || !store
                ? "Calculando sobre la venta de tienda…"
                : <>Sobre venta de tienda <span className="font-semibold text-ink">{money(store.sales)}</span>
                    {/* Con un bracket de importe fijo no hay tasa que enseñar:
                        decir "tasa 0 %" junto a un bono real confunde. */}
                    {commission.payoutType === "FIXED" ? " · importe fijo del nivel" : <> · tasa {commission.percent}%</>}</>}
          </p>
        </div>
        <span className="shrink-0 text-lg font-semibold tabular-nums text-mint">
          {commission ? money(commission.amount) : "—"}
        </span>
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
