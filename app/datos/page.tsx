"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CircleDollarSign,
  Database,
  FileSpreadsheet,
  Gauge,
  Link2,
  Megaphone,
  RefreshCw,
  Settings2,
  Share2,
  Target
} from "lucide-react";
import { getSession } from "@/lib/auth";
import {
  dataSourceTypes,
  type DataSourceProvider,
  type DataSourceRecord,
  type DataSourceStatus,
  type DataSourceType
} from "@/lib/data-source";
import { AppFrame, AppHeader, Badge, BottomNav, Button, Card } from "@/components/ui";

const modules: Record<DataSourceType, { label: string; icon: typeof CalendarDays; description: string }> = {
  HORARIOS: { label: "Horarios", icon: CalendarDays, description: "Turnos, descansos y zonas." },
  KPIS: { label: "KPIs", icon: Gauge, description: "Venta, conversion y productividad." },
  METAS: { label: "Metas", icon: Target, description: "Objetivos diarios y mensuales." },
  COMISIONES: { label: "Comisiones", icon: CircleDollarSign, description: "Reglas, niveles y resultados." },
  COMUNICADOS: { label: "Comunicados", icon: Megaphone, description: "Avisos y confirmaciones de lectura." }
};

const providers: Array<{ value: DataSourceProvider; label: string; icon: typeof Database }> = [
  { value: "MANUAL", label: "Manual", icon: Database },
  { value: "EXCEL", label: "Excel", icon: FileSpreadsheet },
  { value: "SHAREPOINT", label: "SharePoint", icon: Share2 }
];

type ConfigState = {
  type: DataSourceType;
  provider: DataSourceProvider;
  name: string;
  url: string;
};

export default function DataCenterPage() {
  const router = useRouter();
  const [sources, setSources] = useState<DataSourceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getSession().then((session) => {
      if (!session || session.role === "ASESOR") {
        router.replace(session ? "/advisor" : "/login");
        return;
      }
      fetchSources();
    });
  }, [router]);

  async function fetchSources() {
    setLoading(true);
    try {
      const response = await fetch("/api/data-sources", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo cargar el Centro de Datos.");
      const payload = await response.json() as { dataSources: DataSourceRecord[] };
      setSources(payload.dataSources);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el Centro de Datos.");
    } finally {
      setLoading(false);
    }
  }

  const sourceByType = useMemo(() => new Map(sources.map((source) => [source.type, source])), [sources]);
  const scheduledSources = sources.filter((source) => source.nextSyncAt);
  const connectedCount = sources.filter((source) => source.status === "CONNECTED").length;

  function openConfig(type: DataSourceType) {
    const source = sourceByType.get(type);
    setConfig({
      type,
      provider: source?.provider ?? "MANUAL",
      name: source?.name ?? modules[type].label,
      url: source?.url ?? ""
    });
    setMessage("");
    requestAnimationFrame(() => document.getElementById("source-config")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  async function saveSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, url: config.provider === "MANUAL" ? "" : config.url })
      });
      const payload = await response.json() as { dataSource?: DataSourceRecord; error?: string };
      if (!response.ok || !payload.dataSource) throw new Error(payload.error ?? "No se pudo guardar la fuente.");
      setSources((current) => [...current.filter((source) => source.type !== payload.dataSource!.type), payload.dataSource!]);
      setConfig(null);
      setMessage("Fuente vinculada correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la fuente.");
    } finally {
      setSaving(false);
    }
  }

  async function syncSource(source: DataSourceRecord) {
    setSyncingId(source.id);
    setMessage(`Sincronizando ${modules[source.type].label}...`);
    try {
      const response = await fetch(`/api/data-sources/${source.id}/sync`, { method: "POST" });
      const payload = await response.json() as { dataSource?: DataSourceRecord; message?: string; error?: string };
      if (!response.ok || !payload.dataSource) throw new Error(payload.error ?? "No se pudo sincronizar.");
      setSources((current) => current.map((item) => item.id === source.id ? payload.dataSource! : item));
      setMessage(payload.message ?? "Sincronizacion completada");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo sincronizar.");
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <>
      <AppHeader title="Centro de Datos" subtitle="Fuentes, sincronizaciones y automatizaciones." backHref="/manager" />
      <AppFrame>
        <section className="manager-sales-hero rounded-[28px] border border-volt/25 px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-volt">Integraciones de tienda</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">{connectedCount} de 5 vinculadas</h2>
              <p className="mt-1 max-w-[15rem] text-[13px] leading-5 text-muted">Prepara Excel y SharePoint sin alterar la operacion actual.</p>
            </div>
            <span className="grid size-11 shrink-0 place-items-center rounded-[18px] border border-volt/25 bg-volt/12 text-volt">
              <Database size={21} />
            </span>
          </div>
          <Button type="button" variant="primary" className="mt-3 w-full" icon={<Link2 size={17} />} onClick={() => openConfig(dataSourceTypes.find((type) => !sourceByType.has(type)) ?? "HORARIOS")}>
            Vincular fuente
          </Button>
        </section>

        {message ? <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-[13px] font-semibold text-ink/75">{message}</p> : null}

        <section className="mt-3 space-y-2.5" aria-label="Modulos de datos">
          {dataSourceTypes.map((type) => {
            const item = modules[type];
            const source = sourceByType.get(type);
            const status = source?.status ?? "DISCONNECTED";
            const Icon = item.icon;
            return (
              <Card key={type} className="p-3">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[16px] border border-white/10 bg-white/[0.055] text-volt">
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="font-black tracking-[-0.02em]">{item.label}</h2>
                        <p className="text-[11px] text-muted">{item.description}</p>
                      </div>
                      <SourceStatus status={status} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 border-y border-white/[0.07] py-2 text-[11px]">
                      <DataPoint label="Origen" value={providerLabel(source?.provider ?? "MANUAL")} />
                      <DataPoint label="Ultima sync" value={formatDate(source?.lastSyncAt)} />
                      <DataPoint label="Proxima sync" value={formatDate(source?.nextSyncAt)} />
                      <DataPoint label="Registro" value={source?.latestLog ? `${source.latestLog.recordsProcessed} registros` : "Sin actividad"} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => source && void syncSource(source)}
                        disabled={!source || syncingId === source.id}
                        className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-volt/12 text-xs font-black text-volt transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <RefreshCw size={14} className={syncingId === source?.id ? "animate-spin" : ""} />
                        {syncingId === source?.id ? "Sincronizando" : "Sincronizar ahora"}
                      </button>
                      <button type="button" onClick={() => openConfig(type)} className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/[0.06] text-xs font-black text-ink/80 transition active:scale-95">
                        <Settings2 size={14} /> Configurar
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </section>

        {config ? (
          <Card id="source-config" className="mt-3 border-volt/25">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.13em] text-volt">Configurar fuente</p>
                <h2 className="mt-1 text-lg font-black">{modules[config.type].label}</h2>
              </div>
              <button type="button" onClick={() => setConfig(null)} className="text-xs font-black text-muted">Cerrar</button>
            </div>
            <form className="mt-3 grid gap-2.5" onSubmit={saveSource}>
              <div className="grid grid-cols-3 gap-2">
                {providers.map((provider) => {
                  const Icon = provider.icon;
                  return (
                    <button
                      key={provider.value}
                      type="button"
                      onClick={() => setConfig({ ...config, provider: provider.value, url: provider.value === "MANUAL" ? "" : config.url })}
                      className={`grid min-h-16 place-items-center rounded-2xl border text-[11px] font-black transition ${config.provider === provider.value ? "border-volt/40 bg-volt/12 text-volt" : "border-white/10 bg-white/[0.04] text-muted"}`}
                    >
                      <Icon size={18} />{provider.label}
                    </button>
                  );
                })}
              </div>
              <input value={config.name} onChange={(event) => setConfig({ ...config, name: event.target.value })} className="min-h-11 rounded-2xl border border-line bg-panel px-3 outline-none focus:border-volt" placeholder="Nombre de la fuente" required />
              {config.provider !== "MANUAL" ? (
                <input type="url" value={config.url} onChange={(event) => setConfig({ ...config, url: event.target.value })} className="min-h-11 rounded-2xl border border-line bg-panel px-3 outline-none focus:border-volt" placeholder="URL de Excel o SharePoint" required />
              ) : null}
              <Button type="submit" variant="primary" loading={saving} className="w-full" icon={<Link2 size={17} />}>Guardar vinculacion</Button>
            </form>
          </Card>
        ) : null}

        <Card className="mt-3">
          <div className="flex items-center gap-2">
            <CalendarClock size={18} className="text-volt" />
            <div>
              <h2 className="font-black">Automatizaciones programadas</h2>
              <p className="text-[11px] text-muted">Siguiente ejecucion por fuente vinculada.</p>
            </div>
          </div>
          <div className="mt-2 divide-y divide-white/[0.07]">
            {scheduledSources.map((source) => (
              <div key={source.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-bold">{modules[source.type].label}</p>
                  <p className="text-xs text-muted">{providerLabel(source.provider)}</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-ink/70">
                  {formatDate(source.nextSyncAt)} <ArrowRight size={14} className="text-volt" />
                </div>
              </div>
            ))}
            {!loading && scheduledSources.length === 0 ? <p className="py-3 text-[13px] text-muted">Vincula una fuente para crear su primera automatizacion diaria.</p> : null}
            {loading ? <p className="py-3 text-[13px] text-muted">Cargando fuentes...</p> : null}
          </div>
        </Card>
      </AppFrame>
      <BottomNav />
    </>
  );
}

function SourceStatus({ status }: { status: DataSourceStatus }) {
  const config = {
    CONNECTED: { label: "Vinculado", tone: "success" as const, dot: "bg-volt" },
    DISCONNECTED: { label: "No vinculado", tone: "default" as const, dot: "bg-muted" },
    ERROR: { label: "Error", tone: "danger" as const, dot: "bg-orchid" }
  }[status];
  return <Badge tone={config.tone}><span className={`mr-1.5 size-1.5 rounded-full ${config.dot}`} />{config.label}</Badge>;
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return <div className="px-2 py-1"><p className="font-bold uppercase tracking-[0.08em] text-muted">{label}</p><p className="mt-0.5 truncate font-semibold text-ink/80">{value}</p></div>;
}

function providerLabel(provider: DataSourceProvider) {
  return providers.find((item) => item.value === provider)?.label ?? provider;
}

function formatDate(value?: string | null) {
  if (!value) return "Sin programar";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
