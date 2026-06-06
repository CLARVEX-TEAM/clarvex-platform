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
  Target,
  Wifi,
  X
} from "lucide-react";
import { getSession } from "@/lib/auth";
import {
  dataSourceTypes,
  type DataSourceFrequency,
  type DataSourceProvider,
  type DataSourceRecord,
  type DataSourceStatus,
  type DataSourceType,
  type SheetSummary
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
  frequency: DataSourceFrequency;
};

const frequencies: Array<{ value: DataSourceFrequency; label: string; detail: string }> = [
  { value: "MANUAL", label: "Manual", detail: "Solo bajo demanda" },
  { value: "HOURLY", label: "Cada hora", detail: "Actualizacion continua" },
  { value: "DAILY", label: "Diaria", detail: "Cada 24 horas" },
  { value: "WEEKLY", label: "Semanal", detail: "Cada 7 dias" }
];

export default function DataCenterPage() {
  const router = useRouter();
  const [sources, setSources] = useState<DataSourceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testedSheets, setTestedSheets] = useState<Record<string, SheetSummary[]>>({});
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

  useEffect(() => {
    if (!config) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setConfig(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [config, saving]);

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
      url: source?.url ?? "",
      frequency: source?.frequency ?? "MANUAL"
    });
    setMessage("");
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
        body: JSON.stringify(config)
      });
      const payload = await response.json() as { dataSource?: DataSourceRecord; error?: string };
      if (!response.ok || !payload.dataSource) throw new Error(payload.error ?? "No se pudo guardar la fuente.");
      await fetchSources();
      setConfig(null);
      setMessage("Configuracion guardada en PostgreSQL.");
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
      await fetchSources();
    } finally {
      setSyncingId(null);
    }
  }

  async function testConnection(source: DataSourceRecord) {
    setTestingId(source.id);
    setMessage(`Probando conexion de ${modules[source.type].label}...`);
    try {
      const response = await fetch(`/api/data-sources/${source.id}/test`, { method: "POST" });
      const payload = await response.json() as {
        dataSource?: DataSourceRecord;
        workbook?: { sheets: SheetSummary[]; recordsProcessed: number };
        message?: string;
        error?: string;
      };
      if (!response.ok || !payload.dataSource || !payload.workbook) {
        throw new Error(payload.error ?? "No se pudo probar la conexion.");
      }
      setSources((current) => current.map((item) => item.id === source.id ? payload.dataSource! : item));
      setTestedSheets((current) => ({ ...current, [source.id]: payload.workbook!.sheets }));
      setMessage(payload.message ?? "Conexion correcta.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo probar la conexion.");
      await fetchSources();
    } finally {
      setTestingId(null);
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

        {message ? <p className="mt-3 rounded-2xl border border-line bg-blue-50 px-3 py-2 text-[13px] font-semibold text-ink/75">{message}</p> : null}

        <section className="mt-3 space-y-2.5" aria-label="Modulos de datos">
          {dataSourceTypes.map((type) => {
            const item = modules[type];
            const source = sourceByType.get(type);
            const status = source?.status ?? "DISCONNECTED";
            const sheets = source ? testedSheets[source.id] ?? source.latestLog?.sheets ?? [] : [];
            const Icon = item.icon;
            return (
              <Card key={type} className="p-3">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[16px] border border-line bg-blue-50 text-volt">
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
                      <DataPoint label="Frecuencia" value={frequencyLabel(source?.frequency ?? "MANUAL")} />
                    </div>
                    {sheets.length > 0 ? (
                      <div className="mt-2 rounded-2xl border border-line bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted">Hojas detectadas</p>
                        <div className="mt-1.5 grid gap-1">
                          {sheets.map((sheet) => (
                            <div key={sheet.name} className="flex items-center justify-between gap-3 text-[11px]">
                              <span className="truncate font-bold text-ink/80">{sheet.name}</span>
                              <span className="shrink-0 font-semibold text-muted">{sheet.rowCount} filas</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => source && void testConnection(source)}
                        disabled={!source || !source.url || testingId === source.id || syncingId === source.id}
                        className="col-span-2 flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-white text-xs font-black text-ink/75 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Wifi size={14} className={testingId === source?.id ? "animate-pulse" : "text-volt"} />
                        {testingId === source?.id ? "Probando conexion" : "Probar conexion"}
                      </button>
                      <button
                        type="button"
                        onClick={() => source && void syncSource(source)}
                        disabled={!source || !source.url || syncingId === source.id || testingId === source.id}
                        className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-volt/12 text-xs font-black text-volt transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <RefreshCw size={14} className={syncingId === source?.id ? "animate-spin" : ""} />
                        {syncingId === source?.id ? "Sincronizando" : "Sincronizar ahora"}
                      </button>
                      <button type="button" onClick={() => openConfig(type)} className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-100 text-xs font-black text-ink/80 transition active:scale-95">
                        <Settings2 size={14} /> Configurar
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </section>

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
      {config ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 px-3 pb-3 pt-16 backdrop-blur-md sm:items-center" onMouseDown={(event) => {
          if (event.currentTarget === event.target && !saving) setConfig(null);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="source-config-title" className="liquid-glass max-h-[calc(100dvh-5rem)] w-full max-w-md overflow-y-auto rounded-[30px] border-volt/25 p-4 shadow-[0_20px_60px_rgb(15_23_42_/_0.22)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.13em] text-volt">Configurar fuente</p>
                <h2 id="source-config-title" className="mt-1 text-xl font-black tracking-[-0.03em]">{modules[config.type].label}</h2>
                <p className="mt-1 text-xs text-muted">Los cambios se guardan para esta tienda.</p>
              </div>
              <button type="button" onClick={() => setConfig(null)} disabled={saving} className="grid size-10 shrink-0 place-items-center rounded-[16px] bg-slate-100 text-muted transition hover:text-ink disabled:opacity-40" aria-label="Cerrar configuracion">
                <X size={18} />
              </button>
            </div>
            <form className="mt-4 grid gap-3" onSubmit={saveSource}>
              <fieldset>
                <legend className="mb-2 text-xs font-black text-ink/75">Origen de datos</legend>
                <div className="grid grid-cols-3 gap-2">
                  {providers.map((provider) => {
                    const Icon = provider.icon;
                    return (
                      <button
                        key={provider.value}
                        type="button"
                        onClick={() => setConfig({ ...config, provider: provider.value })}
                        className={`grid min-h-16 place-items-center rounded-2xl border text-[11px] font-black transition active:scale-[0.98] ${config.provider === provider.value ? "border-volt/40 bg-volt/12 text-volt" : "border-line bg-slate-50 text-muted"}`}
                        aria-pressed={config.provider === provider.value}
                      >
                        <Icon size={18} />{provider.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="grid gap-1.5 text-xs font-black text-ink/75">
                Nombre de la fuente
                <input autoFocus value={config.name} onChange={(event) => setConfig({ ...config, name: event.target.value })} className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-semibold text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/15" placeholder="Nombre de la fuente" required />
              </label>

              <label className="grid gap-1.5 text-xs font-black text-ink/75">
                URL {config.provider === "MANUAL" ? "(opcional)" : ""}
                <input type="url" value={config.url} onChange={(event) => setConfig({ ...config, url: event.target.value })} className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-semibold text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/15" placeholder="https://..." required={config.provider !== "MANUAL"} />
              </label>

              <fieldset>
                <legend className="mb-2 text-xs font-black text-ink/75">Frecuencia de sincronizacion</legend>
                <div className="grid grid-cols-2 gap-2">
                  {frequencies.map((frequency) => (
                    <button
                      key={frequency.value}
                      type="button"
                      onClick={() => setConfig({ ...config, frequency: frequency.value })}
                      className={`min-h-14 rounded-2xl border px-3 text-left transition active:scale-[0.98] ${config.frequency === frequency.value ? "border-volt/40 bg-volt/12" : "border-line bg-slate-50"}`}
                      aria-pressed={config.frequency === frequency.value}
                    >
                      <span className={`block text-xs font-black ${config.frequency === frequency.value ? "text-volt" : "text-ink"}`}>{frequency.label}</span>
                      <span className="mt-0.5 block text-[10px] text-muted">{frequency.detail}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <Button type="submit" variant="primary" loading={saving} className="w-full" icon={<Link2 size={17} />}>Guardar configuracion</Button>
            </form>
          </section>
        </div>
      ) : null}
      <BottomNav />
    </>
  );
}

function SourceStatus({ status }: { status: DataSourceStatus }) {
  const config = {
    CONNECTED: { label: "CONNECTED", tone: "success" as const, dot: "bg-volt" },
    DISCONNECTED: { label: "DISCONNECTED", tone: "default" as const, dot: "bg-muted" },
    ERROR: { label: "ERROR", tone: "danger" as const, dot: "bg-orchid" }
  }[status];
  return <Badge tone={config.tone}><span className={`mr-1.5 size-1.5 rounded-full ${config.dot}`} />{config.label}</Badge>;
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return <div className="px-2 py-1"><p className="font-bold uppercase tracking-[0.08em] text-muted">{label}</p><p className="mt-0.5 truncate font-semibold text-ink/80">{value}</p></div>;
}

function providerLabel(provider: DataSourceProvider) {
  return providers.find((item) => item.value === provider)?.label ?? provider;
}

function frequencyLabel(frequency: DataSourceFrequency) {
  return frequencies.find((item) => item.value === frequency)?.label ?? frequency;
}

function formatDate(value?: string | null) {
  if (!value) return "Sin programar";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
