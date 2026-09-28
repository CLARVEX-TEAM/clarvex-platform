"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui";
import { currentMonth, dayLabel, type AttendanceRecord } from "@/lib/attendance-view";
import { formatBalance } from "@/lib/hours-balance";
import { countLates, manualCorrections, retardoStatus, RETARDO_LIMIT } from "@/lib/quincena";

/**
 * "Mi quincena — sin sorpresas": tranquilidad laboral para el asesor.
 *
 * Se auto-carga desde /api/attendance (solo lo suyo) y muestra tres cosas que
 * hoy están dispersas y pasivas, ahora juntas y hacia adelante:
 *   1. Semáforo de retardos (límite 3 · al 3.º se descuenta el día) — avisa ANTES.
 *   2. Banco de horas a su favor o en contra.
 *   3. Si gerencia le corrigió una asistencia a mano, lo ve y sabe por qué.
 *
 * Es solo lectura: no captura nada nuevo ni cambia la matemática de nómina.
 */

type AttendanceResponse = {
  users: { id: string; balanceMinutes: number }[];
  records: AttendanceRecord[];
};

const TONE_STYLES = {
  ok: { ring: "bg-mint", chip: "text-mint", soft: "bg-mint/10" },
  warn: { ring: "bg-ember", chip: "text-ember", soft: "bg-ember/10" },
  danger: { ring: "bg-orchid", chip: "text-orchid", soft: "bg-orchid/10" }
} as const;

export function QuincenaCard({ userId }: { userId: string }) {
  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/attendance?month=${currentMonth()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const payload = (await res.json()) as AttendanceResponse;
        if (!cancelled) setData(payload);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Si no carga, no metemos ruido: la tarjeta simplemente no aparece.
  if (failed) return null;

  if (!data) {
    return <div className="h-40 animate-pulse rounded-[28px] bg-panel" />;
  }

  const mine = data.records.filter((record) => record.userId === userId);
  const lates = countLates(mine);
  const status = retardoStatus(lates);
  const tone = TONE_STYLES[status.tone];
  const balanceMinutes = data.users.find((user) => user.id === userId)?.balanceMinutes ?? 0;
  const lastCorrection = manualCorrections(mine)[0];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`grid size-9 place-items-center rounded-2xl ${tone.soft} ${tone.chip}`}>
            <ShieldCheck size={18} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">Mi quincena</h2>
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Sin sorpresas</p>
          </div>
        </div>
        <Link href="/asistencia" className="shrink-0 text-xs font-bold text-volt">Ver detalle →</Link>
      </div>

      {/* Semáforo de retardos */}
      <div className="mt-4 rounded-2xl border border-line bg-panel p-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">{status.headline}</p>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: RETARDO_LIMIT }, (_, i) => (
              <span
                key={i}
                className={`size-2.5 rounded-full ${i < lates ? tone.ring : "bg-muted"}`}
              />
            ))}
          </div>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{status.detail}</p>
      </div>

      {/* Banco de horas */}
      <div className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-3.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Banco de horas</p>
          <p className="mt-0.5 text-xs text-muted">
            {balanceMinutes > 0
              ? "A tu favor: puedes pedir salir temprano hasta ese tiempo sin que te descuenten."
              : balanceMinutes < 0
                ? "Horas que debes reponer. Quédate un poco o entra antes para nivelar."
                : "Estás en ceros. Ni te deben ni debes."}
          </p>
        </div>
        <span
          className={`shrink-0 text-lg font-semibold tabular-nums ${
            balanceMinutes > 0 ? "text-mint" : balanceMinutes < 0 ? "text-orchid" : "text-muted"
          }`}
        >
          {formatBalance(balanceMinutes)}
        </span>
      </div>

      {/* Transparencia de correcciones */}
      {lastCorrection && (
        <div className="mt-2.5 rounded-2xl border border-line bg-panel p-3.5">
          <p className="text-sm font-semibold text-ink">✍️ Ajuste de gerencia</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Se corrigió tu registro del <span className="font-semibold text-ink">{dayLabel(lastCorrection.date)}</span>
            {lastCorrection.note ? <>: “{lastCorrection.note}”.</> : "."} Tu banco quedó en{" "}
            <span className="font-semibold text-ink">{formatBalance(lastCorrection.minutesBalance)}</span> ese día.
          </p>
        </div>
      )}
    </Card>
  );
}
