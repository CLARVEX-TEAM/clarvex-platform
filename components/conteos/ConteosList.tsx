"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Settings2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { Badge, Card, ProgressBar } from "@/components/ui";

// Lista de conteos. Compartida entre /conteos (movil) y /escritorio/conteos.

type CountSummary = {
  id: string;
  date: string;
  status: string;
  theoretical: number | null;
  counted: number;
  totalTags: number;
  pieces: number;
};

export function ConteosListView({ desktop = false }: { desktop?: boolean }) {
  const base = desktop ? "/escritorio/conteos" : "/conteos";
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [counts, setCounts] = useState<CountSummary[] | null>(null);
  const [totalTags, setTotalTags] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getSession().then((s) => {
      if (!s) { router.replace("/login"); return; }
      setSession(s);
    });
  }, [router]);

  const load = useCallback(async () => {
    const res = await fetch("/api/conteos", { cache: "no-store" });
    const data = (await res.json()) as { counts?: CountSummary[]; totalTags?: number };
    setCounts(data.counts ?? []);
    setTotalTags(data.totalTags ?? 0);
  }, []);

  useEffect(() => { if (session) void load(); }, [session, load]);

  const manager = session?.role === "GERENTE" || session?.role === "SUBGERENTE";
  const open = counts?.find((count) => count.status === "OPEN") ?? null;

  async function createCount() {
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/conteos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) })
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (data.error) { setError(data.error); return; }
      if (data.id) router.push(`${base}/${data.id}`);
    } finally {
      setCreating(false);
    }
  }

  function fmt(iso: string) {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  }

  return (
    <div className={desktop ? "mx-auto max-w-2xl" : undefined}>
        {manager && (
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => void createCount()}
              disabled={creating || !!open}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-volt px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              <Plus size={16} /> {open ? "Hay un conteo abierto" : creating ? "Abriendo…" : "Abrir conteo de hoy"}
            </button>
            <Link
              href={`${base}/marbetes`}
              className="flex items-center gap-2 rounded-2xl border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-ink transition active:scale-95"
            >
              <Settings2 size={16} /> Marbetes
            </Link>
          </div>
        )}
        {error && <p className="mb-2 text-xs font-semibold text-red-500">{error}</p>}
        {manager && totalTags === 0 && counts !== null && (
          <Card className="mb-3 p-4 text-sm font-semibold text-muted">
            Aún no hay marbetes dados de alta. Ve a <Link className="font-semibold text-volt" href={`${base}/marbetes`}>Marbetes</Link> y captura los rangos de tienda y bodega (una sola vez: son fijos).
          </Card>
        )}

        {counts === null ? (
          <p className="py-8 text-center text-sm font-bold text-muted">Cargando…</p>
        ) : counts.length === 0 ? (
          <Card className="p-6 text-center">
            <ClipboardList className="mx-auto mb-2 text-muted" size={28} />
            <p className="text-sm font-bold text-muted">Sin conteos todavía. {manager ? "Abre el primero." : "Gerencia abrirá el próximo conteo."}</p>
          </Card>
        ) : (
          <div className="grid gap-2">
            {counts.map((count) => (
              <Link key={count.id} href={`${base}/${count.id}`}>
                <Card className="p-3.5 transition active:scale-[0.99]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold capitalize text-ink">{fmt(count.date)}</p>
                    <Badge tone={count.status === "OPEN" ? "success" : "default"}>
                      {count.status === "OPEN" ? "En curso" : "Cerrado"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1"><ProgressBar value={count.totalTags > 0 ? (count.counted / count.totalTags) * 100 : 0} /></div>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">{count.counted}/{count.totalTags}</span>
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-muted">{count.pieces.toLocaleString("es-MX")} piezas contadas</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
    </div>
  );
}
