"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Printer } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import type { CycleZone, SerializedTag } from "@/lib/cycle-count";
import { AppFrame, AppHeader, BottomNav, Card } from "@/components/ui";

export default function MarbetesPage() {
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [tags, setTags] = useState<SerializedTag[] | null>(null);
  const [zone, setZone] = useState<CycleZone>("PISO");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) { router.replace("/login"); return; }
      if (s.role === "ASESOR") { router.replace("/conteos"); return; }
      setSession(s);
    });
  }, [router]);

  const load = useCallback(async () => {
    const res = await fetch("/api/conteos/tags", { cache: "no-store" });
    const data = (await res.json()) as { tags?: SerializedTag[] };
    setTags(data.tags ?? []);
  }, []);

  useEffect(() => { if (session) void load(); }, [session, load]);

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

  async function toggleActive(tag: SerializedTag) {
    await fetch("/api/conteos/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: [{ id: tag.id, active: !tag.active }] })
    });
    await load();
  }

  const zones: Array<{ id: CycleZone; label: string }> = [
    { id: "PISO", label: "Piso de venta" },
    { id: "BODEGA", label: "Bodega" }
  ];

  return (
    <>
      <AppHeader title="Marbetes" subtitle="Catálogo fijo de tienda y bodega" backHref="/conteos" />
      <AppFrame>
        {/* Alta por rango */}
        <Card className="mb-3 p-4">
          <p className="mb-2 text-sm font-black text-ink">Dar de alta por rango</p>
          <div className="mb-2 flex rounded-full bg-slate-100 p-1 dark:bg-[#1a2540]">
            {zones.map((z) => (
              <button key={z.id} type="button" onClick={() => setZone(z.id)} className={`min-h-9 flex-1 rounded-full text-xs font-black transition ${zone === z.id ? "bg-white text-ink shadow dark:bg-slate-700" : "text-muted"}`}>
                {z.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="Del" aria-label="Marbete inicial" className="min-w-0 flex-1 rounded-2xl border border-line bg-panel px-3 py-2.5 text-center text-sm font-black text-ink outline-none focus:border-volt" />
            <input value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="Al" aria-label="Marbete final" className="min-w-0 flex-1 rounded-2xl border border-line bg-panel px-3 py-2.5 text-center text-sm font-black text-ink outline-none focus:border-volt" />
            <button type="button" onClick={() => void addRange()} disabled={saving} className="flex items-center gap-1 rounded-2xl bg-volt px-4 text-sm font-black text-white transition active:scale-95 disabled:opacity-50">
              <Plus size={15} /> Alta
            </button>
          </div>
          {error && <p className="mt-1.5 text-xs font-semibold text-red-500">{error}</p>}
          <p className="mt-2 text-[11px] font-semibold text-muted">Los marbetes son fijos: se capturan una vez y sirven para todos los conteos. Toca uno para desactivarlo (no se borra el historial).</p>
          <Link
            href="/conteos/marbetes/imprimir"
            className="mt-2.5 flex items-center justify-center gap-2 rounded-2xl border border-line bg-panel py-2.5 text-sm font-black text-ink transition active:scale-95"
          >
            <Printer size={15} /> Imprimir marbetes QR
          </Link>
        </Card>

        {/* Listado */}
        {tags === null ? (
          <p className="py-8 text-center text-sm font-bold text-muted">Cargando…</p>
        ) : (
          zones.map((z) => {
            const zoneTags = tags.filter((tag) => tag.zone === z.id);
            if (zoneTags.length === 0) return null;
            return (
              <Card key={z.id} className="mb-3 p-3.5">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-muted">{z.label} · {zoneTags.filter((t) => t.active).length} activos</p>
                <div className="grid grid-cols-6 gap-1.5">
                  {zoneTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => void toggleActive(tag)}
                      className={`min-h-9 rounded-xl border text-xs font-black transition active:scale-95 ${tag.active ? "border-line bg-panel text-ink" : "border-line/50 bg-slate-500/5 text-muted/50 line-through"}`}
                    >
                      {tag.number}
                    </button>
                  ))}
                </div>
              </Card>
            );
          })
        )}
      </AppFrame>
      <BottomNav />
    </>
  );
}
