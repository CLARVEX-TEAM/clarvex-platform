"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Copy, HelpCircle, ScanLine, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import {
  checkRow,
  DROP_REASONS,
  REASON_LABEL,
  REASON_REF_LABEL,
  copyLines,
  rowMovement,
  type DailyRow,
  type DailySummary,
  type DropReason
} from "@/lib/daily-count";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import { Badge, Card } from "@/components/ui";
import { ScannerOverlay } from "@/components/conteos/ScannerOverlay";

/**
 * Conteo diario de una sección del piso (hoy, dama).
 *
 * No es el conteo físico: no lleva teórico, no cierra ronda y no toca el
 * kardex. Compara contra el conteo anterior de la misma sección y pide motivo
 * solo a los marbetes que BAJARON.
 */

type State = {
  section: string;
  date: string;
  countId: string | null;
  status: string | null;
  previousDate: string | null;
  rows: DailyRow[];
  summary: DailySummary;
};

const today = () => new Date().toISOString().slice(0, 10);

export function ConteoDiarioView({ section = "DAMA" }: { section?: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [editing, setEditing] = useState<DailyRow | null>(null);

  const manager = user?.role === "GERENTE" || user?.role === "SUBGERENTE";

  const load = useCallback(async () => {
    const response = await fetch(`/api/conteos/diario?section=${encodeURIComponent(section)}`, {
      cache: "no-store"
    });
    if (response.ok) setState(await response.json());
  }, [section]);

  useEffect(() => {
    getSession().then(setUser);
    load();
  }, [load]);

  async function openToday() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/conteos/diario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section, date: today() })
    });
    if (!response.ok) setError((await response.json()).error ?? "No se pudo abrir el conteo.");
    await load();
    setBusy(false);
  }

  /** Guarda piezas y/o motivo de un marbete. El servidor devuelve el estado ya recalculado. */
  async function save(number: number, patch: { pieces?: number; reason?: string | null; reasonRef?: string | null }) {
    if (!state?.countId) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/conteos/diario", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countId: state.countId, number, ...patch })
    });
    if (response.ok) setState(await response.json());
    else setError((await response.json()).error ?? "No se pudo guardar.");
    setBusy(false);
  }

  function handleScan(number: number) {
    setScanning(false);
    const known = state?.rows.find((row) => row.number === number);
    if (known) {
      setEditing(known);
      return;
    }
    // Marbete que aún no es de la sección: se enrola al guardarlo. Se abre la
    // hoja con la fila en blanco para que solo teclee las piezas.
    setEditing({
      number,
      position: 0,
      label: null,
      previous: null,
      current: null,
      reason: null,
      reasonRef: null
    });
  }

  if (!state) return <p className="px-1 py-6 text-sm text-muted">Cargando…</p>;

  const open = state.countId !== null && state.status === "OPEN";
  const first = state.rows.length === 0;

  return (
    <div className="space-y-4">
      {error ? (
        <Card className="border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</Card>
      ) : null}

      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Sección {state.section}</p>
            <p className="text-lg font-black text-ink">{state.date}</p>
            <p className="mt-1 text-xs text-muted">
              {state.previousDate
                ? `Se compara contra el conteo del ${state.previousDate}.`
                : "Es el primer conteo: no hay contra qué comparar todavía."}
            </p>
          </div>
          {open ? <Badge tone="success">Abierto</Badge> : null}
        </div>

        {!open ? (
          manager ? (
            <button
              type="button"
              onClick={openToday}
              disabled={busy}
              className="mt-3 w-full rounded-xl bg-volt px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              Abrir el conteo de hoy
            </button>
          ) : (
            <p className="mt-3 text-sm text-muted">La gerencia todavía no abre el conteo de hoy.</p>
          )
        ) : null}
      </Card>

      {open ? (
        <>
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-volt px-4 py-4 text-base font-black text-white"
          >
            <ScanLine size={20} />
            Escanear marbete
          </button>

          {first ? (
            <Card className="p-4 text-sm text-muted">
              <p className="font-bold text-ink">El juego de {state.section} se arma solo</p>
              <p className="mt-1">
                Escanea los marbetes de la sección y se van agregando. A partir de mañana ya salen
                aquí precargados y solo hay que contarlos.
              </p>
            </Card>
          ) : null}

          <SummaryBar summary={state.summary} />

          <div className="space-y-2">
            {state.rows.map((row) => (
              <RowCard key={row.number} row={row} rows={state.rows} onEdit={() => setEditing(row)} />
            ))}
          </div>

          <CopyCount rows={state.rows} />
        </>
      ) : null}

      <AnimatePresence>
        {scanning ? <ScannerOverlay onScan={handleScan} onClose={() => setScanning(false)} /> : null}
      </AnimatePresence>

      <AnimatePresence>
        {editing ? (
          <CaptureSheet
            row={editing}
            rows={state.rows}
            busy={busy}
            onClose={() => setEditing(null)}
            onSave={async (patch) => {
              await save(editing.number, patch);
              setEditing(null);
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function CopyCount({ rows }: { rows: DailyRow[] }) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState("");
  const { text, positions, pending } = copyLines(rows);

  async function copy() {
    setFallback("");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Safari en PWA a veces niega el portapapeles. Antes que dejarlo sin
      // salida, se muestra el texto para copiarlo a mano.
      setFallback(text);
    }
  }

  if (positions === 0) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={copy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-bold text-ink"
      >
        {copied ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Copy size={16} />}
        {copied ? `Copiado · ${positions} marbetes` : "Copiar conteo"}
      </button>
      <p className="text-center text-xs text-muted">
        Pégalo en la columna de piezas del Excel, en el renglón del marbete 1.
        {pending > 0 ? ` ${pending} sin contar van en blanco para no recorrer los demás.` : ""}
      </p>
      {fallback ? (
        <textarea
          readOnly
          value={fallback}
          rows={Math.min(positions, 12)}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full rounded-xl border border-line bg-panel p-3 text-sm tabular-nums text-ink"
        />
      ) : null}
    </div>
  );
}

function SummaryBar({ summary }: { summary: DailySummary }) {
  return (
    <Card className="grid grid-cols-3 gap-3 p-4 text-center">
      <div>
        <p className="text-xs font-bold uppercase text-muted">Contados</p>
        <p className="text-lg font-black text-ink">
          {summary.counted}/{summary.tags}
        </p>
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-muted">Neto</p>
        <p className="text-lg font-black text-ink">{summary.net === 0 ? "0" : -summary.net}</p>
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-muted">Sin explicar</p>
        <p className={`text-lg font-black ${summary.unexplained > 0 ? "text-rose-600" : "text-emerald-600"}`}>
          {summary.unexplained}
        </p>
      </div>
      {summary.drops > 0 || summary.gains > 0 ? (
        <p className="col-span-3 text-xs text-muted">
          Bajaron {summary.drops} piezas y subieron {summary.gains}.
          {summary.net === 0 && summary.drops > 0
            ? " Se movió entre marbetes: la sección no perdió piezas."
            : ""}
        </p>
      ) : null}
      {summary.toReview > 0 ? (
        <p className="col-span-3 text-xs font-semibold text-amber-700">
          {summary.toReview} justificación(es) por revisar.
        </p>
      ) : null}
    </Card>
  );
}

function RowCard({ row, rows, onEdit }: { row: DailyRow; rows: DailyRow[]; onEdit: () => void }) {
  const movement = rowMovement(row);
  const check = checkRow(row, rows);

  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-panel p-3 text-left"
    >
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-panel">
        <span className="text-base font-black text-ink">{row.position || "—"}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">
          {row.label ?? `Marbete ${row.position || row.number}`}
        </p>
        <p className="text-xs text-muted">
          Etiqueta {row.number} · antes {row.previous ?? "—"} · hoy {row.current ?? "—"}
        </p>
        {check.status !== "NONE" ? (
          <p
            className={`mt-0.5 text-xs font-semibold ${
              check.status === "OK"
                ? "text-emerald-700"
                : check.status === "PENDING"
                  ? "text-rose-700"
                  : "text-amber-700"
            }`}
          >
            {check.detail}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`text-base font-black ${
            movement === null ? "text-muted" : movement < 0 ? "text-rose-600" : movement > 0 ? "text-emerald-600" : "text-muted"
          }`}
        >
          {movement === null ? "—" : movement > 0 ? `+${movement}` : movement}
        </p>
      </div>
    </button>
  );
}

function CaptureSheet({
  row,
  rows,
  busy,
  onClose,
  onSave
}: {
  row: DailyRow;
  rows: DailyRow[];
  busy: boolean;
  onClose: () => void;
  onSave: (patch: { pieces?: number; reason?: string | null; reasonRef?: string | null }) => void;
}) {
  const [pieces, setPieces] = useState(row.current === null ? "" : String(row.current));
  const [reason, setReason] = useState<DropReason | "">(row.reason ?? "");
  const [reasonRef, setReasonRef] = useState(row.reasonRef ?? "");
  const inset = useKeyboardInset();

  const typed = pieces.trim() === "" ? null : Number(pieces.replace(/\D/g, ""));
  // El motivo se pide con lo que se está tecleando, no con lo ya guardado: así
  // aparece en cuanto el número baja, sin tener que guardar primero para verlo.
  const movement = row.previous === null || typed === null ? null : typed - row.previous;
  const dropped = movement !== null && movement < 0;

  const preview = checkRow({ ...row, current: typed, reason: reason || null, reasonRef }, rows);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-end bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        onClick={(event) => event.stopPropagation()}
        className="w-full rounded-t-3xl bg-card p-5"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + 20px + ${inset}px)` }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-base font-black text-ink">
              {row.label ?? `Marbete ${row.position || row.number}`}
            </p>
            <p className="text-xs text-muted">
              Etiqueta {row.number}
              {row.previous !== null ? ` · antes ${row.previous} piezas` : " · sin conteo anterior"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid size-9 place-items-center rounded-full bg-panel">
            <X size={16} />
          </button>
        </div>

        <label className="block text-xs font-bold uppercase text-muted" htmlFor="daily-pieces">
          Piezas contadas
        </label>
        <input
          id="daily-pieces"
          inputMode="numeric"
          autoFocus
          value={pieces}
          onChange={(event) => setPieces(event.target.value.replace(/\D/g, ""))}
          className="mt-1 w-full rounded-xl border border-line px-4 py-3 text-2xl font-black text-ink"
        />

        {dropped ? (
          <div className="mt-4 space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <AlertTriangle size={16} className="text-amber-600" />
              Bajó {-movement} pieza(s). ¿Por qué?
            </p>
            <div className="grid gap-1.5">
              {DROP_REASONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setReason(option)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold ${
                    reason === option ? "border-volt bg-panel text-volt" : "border-line text-ink"
                  }`}
                >
                  {REASON_LABEL[option]}
                </button>
              ))}
            </div>
            {reason && REASON_REF_LABEL[reason] ? (
              <input
                value={reasonRef}
                onChange={(event) => setReasonRef(event.target.value)}
                placeholder={REASON_REF_LABEL[reason]}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm"
              />
            ) : null}
            {preview.status !== "NONE" ? (
              <p
                className={`flex items-start gap-1.5 text-xs font-semibold ${
                  preview.status === "OK" ? "text-emerald-700" : preview.status === "PENDING" ? "text-rose-700" : "text-amber-700"
                }`}
              >
                {preview.status === "OK" ? <CheckCircle2 size={14} className="mt-px shrink-0" /> : <HelpCircle size={14} className="mt-px shrink-0" />}
                {preview.detail}
              </p>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          disabled={busy || typed === null}
          onClick={() => onSave({ pieces: typed ?? undefined, reason: reason || null, reasonRef })}
          className="mt-4 w-full rounded-xl bg-volt px-4 py-3 text-base font-black text-white disabled:opacity-50"
        >
          Guardar
        </button>
      </motion.div>
    </motion.div>,
    document.body
  );
}
