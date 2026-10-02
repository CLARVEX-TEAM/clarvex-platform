"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftRight, Plus, Power, Printer, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import type { CycleZone, SerializedTag } from "@/lib/cycle-count";
import { useCargaConReintento } from "@/lib/use-carga";
import { NoSePudoCargar } from "@/components/conteos/NoSePudoCargar";
import { Card } from "@/components/ui";
import { useTono } from "@/components/conteos/tono";

// Catalogo de marbetes. Compartido entre movil y escritorio.

export function ConteosMarbetesView({ desktop = false }: { desktop?: boolean }) {
  const tono = useTono();
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [tags, setTags] = useState<SerializedTag[] | null>(null);
  const [zone, setZone] = useState<CycleZone>("PISO");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    getSession().then((s) => {
      if (!s) { router.replace("/login"); return; }
      if (s.role === "ASESOR") { router.replace(desktop ? "/escritorio" : "/conteos"); return; }
      setSession(s);
    });
  }, [router, desktop]);

  /* ⚠️ Lanza si el servidor no contestó bien: sin eso `tags` se quedaba en
     `null` y la pantalla en «Cargando…» para siempre. Ver `lib/use-carga.ts`. */
  const load = useCallback(async () => {
    const res = await fetch("/api/conteos/tags", { cache: "no-store" });
    if (!res.ok) throw new Error(`/api/conteos/tags respondió ${res.status}`);
    const data = (await res.json()) as { tags?: SerializedTag[] };
    setTags(data.tags ?? []);
  }, []);

  const { fallo, cargando, reintentar } = useCargaConReintento(load, session !== null);

  async function addRange() {
    setError("");
    const fromNum = parseInt(from, 10);
    const toNum = parseInt(to, 10);
    if (!Number.isFinite(fromNum) || !Number.isFinite(toNum) || toNum < fromNum) {
      setError("Indica un rango válido (ej. 1 a 60).");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/conteos/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ranges: [{ zone, from: fromNum, to: toNum }] })
      });
      const data = (await res.json()) as { tags?: SerializedTag[]; error?: string };
      if (data.error) { setError(data.error); return; }
      setTags(data.tags ?? []);
      setFrom("");
      setTo("");
    } finally {
      setSaving(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Aplica un cambio (zona o activo/inactivo) a los marbetes seleccionados.
  async function applyToSelected(change: { zone?: CycleZone; active?: boolean }) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setSaving(true);
    setError("");
    try {
      await fetch("/api/conteos/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: ids.map((id) => ({ id, ...change })) })
      });
      setSelected(new Set());
      await load();
    } finally {
      setSaving(false);
    }
  }

  const zones: Array<{ id: CycleZone; label: string }> = [
    { id: "PISO", label: "Piso de venta" },
    { id: "BODEGA", label: "Bodega" }
  ];

  return (
    <div className={desktop ? "mx-auto max-w-2xl" : undefined}>
        {/* Alta por rango */}
        <Card className="mb-3 p-4">
          <p className="mb-2 text-sm font-semibold text-ink">Dar de alta por rango</p>
          <div className={`mb-2 flex rounded-full p-1 ${tono("bg-panel", "bg-slate-100 dark:bg-[#1a2540]")}`}>
            {zones.map((z) => (
              <button key={z.id} type="button" onClick={() => setZone(z.id)} className={`min-h-9 flex-1 rounded-full text-xs font-semibold transition ${zone === z.id ? tono("bg-white text-ink shadow-sm dark:bg-panel", "bg-white text-ink shadow-sm dark:bg-slate-700") : "text-muted"}`}>
                {z.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="Del" aria-label="Marbete inicial" className="min-w-0 flex-1 rounded-2xl border border-line bg-panel px-3 py-2.5 text-center text-sm font-semibold text-ink outline-hidden focus:border-volt" />
            <input value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="Al" aria-label="Marbete final" className="min-w-0 flex-1 rounded-2xl border border-line bg-panel px-3 py-2.5 text-center text-sm font-semibold text-ink outline-hidden focus:border-volt" />
            <button type="button" onClick={() => void addRange()} disabled={saving} className="flex items-center gap-1 rounded-2xl bg-volt px-4 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50">
              <Plus size={15} /> Alta
            </button>
          </div>
          {error && <p className={`mt-1.5 text-xs font-semibold ${tono("text-orchid", "text-red-500")}`}>{error}</p>}
          <p className="mt-2 text-[11px] font-semibold text-muted">Los marbetes son fijos y sirven para todos los conteos. Toca uno o varios para seleccionarlos y luego muévelos de zona, actívalos o desactívalos. No se borra el historial.</p>
          <Link
            href="/conteos/marbetes/imprimir"
            className="mt-2.5 flex items-center justify-center gap-2 rounded-2xl border border-line bg-panel py-2.5 text-sm font-semibold text-ink transition active:scale-95"
          >
            <Printer size={15} /> Imprimir marbetes QR
          </Link>
        </Card>

        {/* Barra de acciones para los marbetes seleccionados */}
        {selected.size > 0 ? (
          <Card className="sticky top-2 z-10 mb-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink">{selected.size} seleccionado{selected.size === 1 ? "" : "s"}</span>
              <div className="ml-auto flex flex-wrap gap-1.5">
                <button type="button" disabled={saving} onClick={() => void applyToSelected({ zone: "BODEGA" })} className="flex items-center gap-1 rounded-xl bg-volt px-3 py-2 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50">
                  <ArrowLeftRight size={13} /> A Bodega
                </button>
                <button type="button" disabled={saving} onClick={() => void applyToSelected({ zone: "PISO" })} className="flex items-center gap-1 rounded-xl bg-volt px-3 py-2 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50">
                  <ArrowLeftRight size={13} /> A Piso
                </button>
                <button type="button" disabled={saving} onClick={() => void applyToSelected({ active: false })} className={`flex items-center gap-1 rounded-xl bg-panel px-3 py-2 text-xs font-semibold ${tono("text-orchid", "text-rose-600")} ring-1 ring-line transition active:scale-95 disabled:opacity-50`}>
                  <Power size={13} /> Desactivar
                </button>
                <button type="button" disabled={saving} onClick={() => void applyToSelected({ active: true })} className={`flex items-center gap-1 rounded-xl bg-panel px-3 py-2 text-xs font-semibold ${tono("text-mint", "text-emerald-600")} ring-1 ring-line transition active:scale-95 disabled:opacity-50`}>
                  <Power size={13} /> Activar
                </button>
                <button type="button" onClick={() => setSelected(new Set())} aria-label="Cancelar selección" className="grid size-9 place-items-center rounded-xl bg-panel text-muted ring-1 ring-line transition active:scale-95">
                  <X size={14} />
                </button>
              </div>
            </div>
          </Card>
        ) : null}

        {/* Listado */}
        {fallo ? (
          <NoSePudoCargar cargando={cargando} onReintentar={() => void reintentar()} que="los marbetes" />
        ) : tags === null ? (
          <p className="py-8 text-center text-sm font-bold text-muted">Cargando…</p>
        ) : (
          zones.map((z) => {
            const zoneTags = tags.filter((tag) => tag.zone === z.id);
            if (zoneTags.length === 0) return null;
            return (
              <Card key={z.id} className="mb-3 p-3.5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{z.label} · {zoneTags.filter((t) => t.active).length} activos</p>
                <div className="grid grid-cols-6 gap-1.5">
                  {zoneTags.map((tag) => {
                    const isSelected = selected.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleSelect(tag.id)}
                        aria-pressed={isSelected}
                        className={`min-h-9 rounded-xl border text-xs font-semibold transition active:scale-95 ${
                          isSelected
                            ? "border-volt bg-volt/15 text-volt ring-2 ring-volt/40"
                            : tag.active
                              ? "border-line bg-panel text-ink"
                              : tono("border-line/50 bg-muted/5 text-muted/50 line-through", "border-line/50 bg-slate-500/5 text-muted/50 line-through")
                        }`}
                      >
                        {tag.number}
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })
        )}
    </div>
  );
}
