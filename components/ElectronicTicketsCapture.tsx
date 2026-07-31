"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Mail, TriangleAlert } from "lucide-react";
import { captureDenominator, captureRate, monthTotals, validateCapture } from "@/lib/electronic-tickets";

/**
 * Captura semanal del ticket electrónico.
 *
 * El POS no exporta y antes se pasaba a mano al RDV filtrando A DIARIO: 70
 * números por semana, por eso la columna llevaba meses vacía. Aquí se teclea
 * UNO por asesor, porque el denominador (tickets totales) ya llega del RDV.
 *
 * La tasa se recalcula mientras se escribe, a propósito: un dedazo se ve en el
 * momento y no dos semanas después en un ranking imposible.
 *
 * Componente compartido: lo montan `/datos` y `/escritorio/datos`. Uno solo
 * para las dos, en vez de mantener dos copias que se separan con el tiempo.
 */

type Row = {
  userId: string;
  name: string;
  employeeNumber: string;
  rdvTransactions: number;
  crmTransactions: number | null;
  posTransactions: number | null;
};

type Week = { weekStart: string; weekEnd: string; weekNumber: number; label: string };

type Payload = { weeks: Week[]; rows: Record<string, Row[]>; message?: string };

function percent(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

export function ElectronicTicketsCapture() {
  const [data, setData] = useState<Payload | null>(null);
  const [week, setWeek] = useState<string>("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/electronic-tickets", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as Payload;
      setData(payload);
      // Arranca en la última semana con datos, que es la que se va a capturar.
      setWeek((current) => current || payload.weeks[payload.weeks.length - 1]?.weekStart || "");
    } catch {
      setError("No se pudieron cargar las semanas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => (data && week ? data.rows[week] ?? [] : []), [data, week]);

  // Al cambiar de semana, el borrador se rellena con lo ya guardado.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of rows) next[row.userId] = row.crmTransactions === null ? "" : String(row.crmTransactions);
    setDraft(next);
    setSaved(false);
    setError("");
  }, [rows]);

  function liveRow(row: Row): Row {
    const raw = draft[row.userId];
    const parsed = raw === undefined || raw.trim() === "" ? null : Number(raw);
    return { ...row, crmTransactions: Number.isFinite(parsed) ? parsed : null };
  }

  const monthly = useMemo(() => {
    if (!data) return { crm: 0, tickets: 0, rate: null as number | null };
    // Todas las semanas del mes, con la que se está editando en su valor actual.
    const all = Object.entries(data.rows).flatMap(([weekKey, weekRows]) =>
      weekKey === week ? weekRows.map(liveRow) : weekRows
    );
    return monthTotals(all);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, week, draft]);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const entries = rows.map((row) => {
        const live = liveRow(row);
        return { userId: row.userId, crmTransactions: live.crmTransactions, posTransactions: row.posTransactions };
      });
      const response = await fetch("/api/electronic-tickets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: week, entries })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setSaved(true);
      await load();
      window.setTimeout(() => setSaved(false), 2500);
    } catch (saveError) {
      setError(saveError instanceof Error && saveError.message ? saveError.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-panel p-5 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" />
        Cargando semanas…
      </div>
    );
  }

  if (!data || data.weeks.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-5">
        <p className="text-sm font-semibold text-ink">Ticket electrónico</p>
        <p className="mt-1 text-sm text-muted">
          {data?.message ?? "Aún no hay semanas sincronizadas del RDV, así que no hay dónde capturar."}
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-volt/12 text-volt">
            <Mail size={17} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink">Ticket electrónico</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Escribe cuántos tickets electrónicos mandó cada quien. Los tickets totales ya vienen del RDV.
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Mes</p>
          <p className="text-lg font-bold tabular-nums text-ink">{percent(monthly.rate)}</p>
          <p className="text-[11px] tabular-nums text-muted">
            {monthly.crm} de {monthly.tickets}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {data.weeks.map((option) => (
          <button
            key={option.weekStart}
            type="button"
            onClick={() => setWeek(option.weekStart)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
              option.weekStart === week
                ? "bg-volt text-white"
                : "bg-line/50 text-muted hover:bg-line hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[26rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Asesor</th>
              <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Tickets</th>
              <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Electrónicos</th>
              <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Tasa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const live = liveRow(row);
              const issue = validateCapture(live);
              return (
                <tr key={row.userId} className="border-b border-line/60 last:border-b-0">
                  <td className="py-2.5 pr-3">
                    <span className="block font-semibold text-ink">{row.name}</span>
                    <span className="text-[11px] text-muted">{row.employeeNumber}</span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-muted">{captureDenominator(live)}</td>
                  <td className="py-2.5 pl-3 text-right">
                    <input
                      inputMode="numeric"
                      value={draft[row.userId] ?? ""}
                      onChange={(event) => {
                        setDraft((current) => ({ ...current, [row.userId]: event.target.value.replace(/\D/g, "") }));
                        setSaved(false);
                      }}
                      placeholder="—"
                      aria-label={`Tickets electrónicos de ${row.name}`}
                      className={`h-9 w-20 rounded-lg border bg-void px-2 text-right text-sm font-semibold tabular-nums text-ink outline-none transition focus:border-volt ${
                        issue ? "border-rose-500" : "border-line"
                      }`}
                    />
                  </td>
                  <td className="py-2.5 pl-3 text-right font-semibold tabular-nums text-ink">
                    {percent(captureRate(live))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.some((row) => validateCapture(liveRow(row)) === "excede") ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs font-semibold text-rose-600">
          <TriangleAlert size={14} className="mt-px shrink-0" />
          Hay alguien con más tickets electrónicos que tickets totales. Revisa el número antes de guardar.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-xs font-semibold text-rose-600">{error}</p> : null}

      <div className="mt-4 flex items-center justify-end gap-3">
        {saved ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <Check size={14} />
            Guardado
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="min-h-10 rounded-xl bg-volt px-4 text-sm font-semibold text-white transition hover:bg-[#1D4ED8] disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar la semana"}
        </button>
      </div>
    </section>
  );
}
