"use client";

import { useEffect, useState } from "react";
import { BookOpen, CalendarClock, FileText, PenLine } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { AppFrame, AppHeader, Badge, BottomNav, Button, Card, StatCard } from "@/components/ui";

export default function BitacoraPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [category, setCategory] = useState("Apertura");
  const [description, setDescription] = useState("");
  const [formStatus, setFormStatus] = useState("");

  useEffect(() => {
    fetchAppData().then(setData).catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <>
        <AppHeader title="Bitacora" subtitle="Cargando registros desde PostgreSQL." backHref="/manager" />
        <AppFrame><Card>Conectando...</Card></AppFrame>
        <BottomNav />
      </>
    );
  }

  const entries = [...data.logEntries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = entries[entries.length - 1];
  const userName = (id: string) => data.users.find((user) => user.id === id)?.name ?? "Equipo";

  async function createLog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    setFormStatus("Guardando...");
    const response = await fetch("/api/logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, description }) });
    const payload = await response.json() as { logEntry?: AppData["logEntries"][number]; error?: string };
    if (!response.ok || !payload.logEntry) { setFormStatus(payload.error ?? "No se pudo guardar el registro."); return; }
    setData({ ...data, logEntries: [...data.logEntries, payload.logEntry] });
    setDescription(""); setFormStatus("Registro guardado.");
  }

  return (
    <>
      <AppHeader title="Bitacora" subtitle="Registro cronologico de operacion de tienda." backHref="/manager" />
      <AppFrame>
        <Card className="mb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink/45">Operacion</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-ink">{entries.length} registros</h2>
              <p className="mt-1 text-sm text-ink/58">
                Ultimo: {latest ? new Date(latest.date).toLocaleDateString("es-MX") : "sin registros"}
              </p>
            </div>
            <div className="grid size-16 place-items-center rounded-[1.35rem] border border-orchid/25 bg-orchid/10 text-orchid">
              <BookOpen size={25} />
            </div>
          </div>
        </Card>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <StatCard label="Categorias" value={String(new Set(entries.map((entry) => entry.category)).size)} detail="En uso" tone="mint" />
          <StatCard label="Autores" value={String(new Set(entries.map((entry) => entry.authorId)).size)} detail="Equipo" tone="ember" />
        </div>

        <Card className="mb-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">Nuevo registro</h2>
              <p className="mt-1 text-sm text-ink/50">Captura eventos relevantes de apertura, cliente, inventario o cierre.</p>
            </div>
            <PenLine className="text-volt" size={20} />
          </div>
          <form className="mt-4 grid gap-3" onSubmit={createLog}>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-12 rounded-2xl border border-line/80 bg-panel/75 px-3 py-3 text-ink outline-none transition focus:border-volt focus:ring-4 focus:ring-volt/15">
              <option>Apertura</option><option>Cliente</option><option>Inventario</option><option>Equipo</option><option>Cierre</option>
            </select>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-24 rounded-2xl border border-line/80 bg-panel/75 px-3 py-3 text-ink outline-none transition placeholder:text-ink/34 focus:border-volt focus:ring-4 focus:ring-volt/15" placeholder="Descripcion del registro" required />
            {formStatus ? <p className="text-sm font-semibold text-muted">{formStatus}</p> : null}
            <Button type="submit" className="w-full" icon={<FileText size={17} />}>
              Guardar registro
            </Button>
          </form>
        </Card>

        <div className="space-y-3">
          {entries.map((entry, index) => (
            <Card key={entry.id} className="relative overflow-hidden">
              <div className="absolute bottom-0 left-5 top-11 w-px bg-line/70" />
              <div className="relative flex gap-3">
                <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-2xl border border-mint/25 bg-mint/10 text-mint">
                  <CalendarClock size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge>{entry.category}</Badge>
                    <p className="text-xs text-ink/42">{new Date(entry.date).toLocaleString("es-MX")}</p>
                  </div>
                  <p className="mt-3 text-ink/80">{entry.description}</p>
                  <p className="mt-2 text-sm font-semibold text-mint">{index + 1}. {userName(entry.authorId)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </AppFrame>
      <BottomNav />
    </>
  );
}
