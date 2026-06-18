"use client";

import { useEffect, useMemo, useState } from "react";
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
  Tags,
  Target,
  Wifi,
  X
} from "lucide-react";
import {
  dataSourceTypes,
  type DataSourceFrequency,
  type KpiSyncMetrics,
  type DataSourceProvider,
  type DataSourceRecord,
  type DataSourceStatus,
  type DataSourceType,
  type SheetSummary
} from "@/lib/data-source";
import { Badge, Button, Card } from "@/components/ui";

const modules: Record<DataSourceType, { label: string; icon: typeof CalendarDays; description: string }> = {
  HORARIOS: { label: "Horarios", icon: CalendarDays, description: "Turnos, descansos y zonas." },
  KPIS: { label: "KPIs", icon: Gauge, description: "Venta, conversion y productividad." },
  METAS: { label: "Metas", icon: Target, description: "Objetivos diarios y mensuales." },
  COMISIONES: { label: "Comisiones", icon: CircleDollarSign, description: "Reglas, niveles y resultados." },
  COMUNICADOS: { label: "Comunicados", icon: Megaphone, description: "Avisos y confirmaciones de lectura." },
  DESCUENTOS_POS: { label: "Descuentos POS", icon: Tags, description: "Venta bruta, descuentos y limite permitido." }
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

export default function EscritorioDatos() {
  const [sources, setSources] = useState<DataSourceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testedSheets, setTestedSheets] = useState<Record<string, SheetSummary[]>>({});
  const [testedRecords, setTestedRecords] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetchSources();
  }, []);

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
      setTestedSheets((current) => omitSourceResult(current, payload.dataSource!.id));
      setTestedRecords((current) => omitSourceResult(current, payload.dataSource!.id));
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
      setTestedRecords((current) => ({ ...current, [source.id]: payload.workbook!.recordsProcessed }));
      setMessage(payload.message ?? "Conexion correcta.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo probar la conexion.");
      await fetchSources();
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="manager-sales-hero rounded-[28px] border border-volt/25 px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-volt">Integraciones de tienda</p>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.035em] text-ink">{connectedCount} de {dataSourceTypes.length} vinculadas</h2>
            <p className="mt-1 max-w-md text-[13px] leading-5 text-muted">Prepara Excel y SharePoint sin alterar la operación actual.</p>
          </div>
          <Button type="button" variant="primary" icon={<Link2 size={17} />} onClick={() => openConfig(dataSourceTypes.find((type) => !sourceByType.has(type)) ?? "HORARIOS")}>
            Vincular fuente
          </Button>
        </div>
      </section>

      {message ? <p className="rounded-2xl border border-line bg-blue-50 px-3 py-2 text-[13px] font-semibold text-ink/75 dark:bg-blue-950/30">{message}</p> : null}

      <section className="grid grid-cols-2 gap-4" aria-label="Modulos de datos">
        {dataSourceTypes.map((type) => {
          const item = modules[type];
          const source = sourceByType.get(type);
          const status = source?.status ?? "DISCONNECTED";
          const sheets = source ? testedSheets[source.id] ?? source.latestLog?.sheets ?? [] : [];
          const recordsProcessed = source ? source.latestLog?.recordsProcessed ?? testedRecords[source.id] : undefined;
          const kpiMetrics = source?.type === "KPIS" && isKpiSyncMetrics(source.latestLog?.details) ? source.latestLog.details : null;
          const canConnect = Boolean(source?.url && source.provider !== "MANUAL");
          const Icon = item.icon;
          return (
            <Card key={type} className="p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-[16px] border border-line bg-blue-50 text-volt dark:bg-blue-950/40">
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-black tracking-[-0.02em] text-ink">{item.label}</h2>
                      <p className="text-[11px] text-muted">{item.description}</p>
                    </div>
                    <SourceStatus status={status} />
                  </div>
                  <div className="mt-2 flex items-center gap-2 border-y border-line py-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-blue-50 text-volt dark:bg-blue-950/40">
                      <FileSpreadsheet size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">Archivo vinculado</p>
                      <p className="truncate text-xs font-black text-ink/85">{source?.name ?? "Sin archivo configurado"}</p>
                      {source?.url ? <p className="truncate text-[10px] text-muted">{linkedFileReference(source.url)}</p> : null}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 py-1 text-[11px]">
                    <DataPoint label="Origen" value={providerLabel(source?.provider ?? "MANUAL")} />
                    <DataPoint label="Ultima sync" value={formatDate(source?.lastSyncAt)} />
                    <DataPoint label="Resultado" value={syncResult(source)} />
                    <DataPoint label="Registros" value={recordsProcessed !== undefined ? `${recordsProcessed.toLocaleString("es-MX")} sincronizados` : "Sin procesar"} />
                  </div>
                  {kpiMetrics ? (
                    <>
                      <div className="mt-1 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line">
                        <MetricDetail label="Filas leidas" value={kpiMetrics.rowsRead} />
                        <MetricDetail label="Creados" value={kpiMetrics.recordsCreated} />
                        <MetricDetail label="Actualizados" value={kpiMetrics.recordsUpdated} />
                        <MetricDetail label="Ignoradas" value={kpiMetrics.ignoredRows} />
                      </div>
                      {"ttlsMeta" in kpiMetrics ? (
                        <div className="mt-1 rounded-2xl border border-line bg-slate-50 px-3 py-2 dark:bg-slate-800">
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Totales fila TTLS</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                            <span className="text-muted">Tráfico</span><span className="font-bold text-ink">{(kpiMetrics as KpiSyncMetrics).ttlsTraffic?.toLocaleString("es-MX") ?? "—"}</span>
                            <span className="text-muted">Meta</span><span className="font-bold text-ink">${(kpiMetrics as KpiSyncMetrics).ttlsMeta?.toLocaleString("es-MX") ?? "—"}</span>
                            <span className="text-muted">Venta</span><span className="font-bold text-ink">${(kpiMetrics as KpiSyncMetrics).ttlsSales?.toLocaleString("es-MX") ?? "—"}</span>
                            <span className="text-muted">TX</span><span className="font-bold text-ink">{(kpiMetrics as KpiSyncMetrics).ttlsTransactions?.toLocaleString("es-MX") ?? "—"}</span>
                            <span className="text-muted">Piezas</span><span className="font-bold text-ink">{(kpiMetrics as KpiSyncMetrics).ttlsPieces?.toLocaleString("es-MX") ?? "—"}</span>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {sheets.length > 0 ? (
                    <div className="mt-2 rounded-2xl border border-line bg-slate-50 px-3 py-2 dark:bg-slate-800">
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Hojas detectadas</p>
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
                      disabled={!canConnect || testingId === source?.id || syncingId === source?.id}
                      className="col-span-2 flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-white text-xs font-black text-ink/75 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-800"
                    >
                      <Wifi size={14} className={testingId === source?.id ? "animate-pulse" : "text-volt"} />
                      {testingId === source?.id ? "Probando conexion" : "Probar conexion"}
                    </button>
                    <button
                      type="button"
                      onClick={() => source && void syncSource(source)}
                      disabled={!canConnect || syncingId === source?.id || testingId === source?.id}
                      className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-volt/12 text-xs font-black text-volt transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <RefreshCw size={14} className={syncingId === source?.id ? "animate-spin" : ""} />
                      {syncingId === source?.id ? "Sincronizando" : "Sincronizar ahora"}
                    </button>
                    <button type="button" onClick={() => openConfig(type)} className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-100 text-xs font-black text-ink/80 transition active:scale-95 dark:bg-slate-700">
                      <Settings2 size={14} /> Configurar
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <CalendarClock size={18} className="text-volt" />
          <div>
            <h2 className="font-black text-ink">Automatizaciones programadas</h2>
            <p className="text-[11px] text-muted">Siguiente ejecución por fuente vinculada.</p>
          </div>
        </div>
        <div className="mt-2 divide-y divide-line">
          {scheduledSources.map((source) => (
            <div key={source.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <p className="font-bold text-ink">{modules[source.type].label}</p>
                <p className="max-w-md truncate text-xs text-muted">{source.name} · {frequencyLabel(source.frequency)}</p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-ink/70">
                {formatDate(source.nextSyncAt)} <ArrowRight size={14} className="text-volt" />
              </div>
            </div>
          ))}
          {!loading && scheduledSources.length === 0 ? <p className="py-3 text-[13px] text-muted">Vincula una fuente para crear su primera automatización diaria.</p> : null}
          {loading ? <p className="py-3 text-[13px] text-muted">Cargando fuentes…</p> : null}
        </div>
      </Card>

      {config ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-3 py-10 backdrop-blur-md" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setConfig(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="source-config-title" className="liquid-glass max-h-[calc(100dvh-5rem)] w-full max-w-md overflow-y-auto rounded-[30px] border-volt/25 p-5 shadow-[0_20px_60px_rgb(15_23_42_/_0.22)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-volt">Configurar fuente</p>
                <h2 id="source-config-title" className="mt-1 text-xl font-black tracking-[-0.03em] text-ink">{modules[config.type].label}</h2>
                <p className="mt-1 text-xs text-muted">Los cambios se guardan para esta tienda.</p>
              </div>
              <button type="button" onClick={() => setConfig(null)} disabled={saving} className="grid size-10 shrink-0 place-items-center rounded-[16px] bg-slate-100 text-muted transition hover:text-ink disabled:opacity-40 dark:bg-slate-700" aria-label="Cerrar configuracion">
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
                        className={`grid min-h-16 place-items-center rounded-2xl border text-[11px] font-black transition active:scale-[0.98] ${config.provider === provider.value ? "border-volt/40 bg-volt/12 text-volt" : "border-line bg-slate-50 text-muted dark:bg-slate-800"}`}
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
                      className={`min-h-14 rounded-2xl border px-3 text-left transition active:scale-[0.98] ${config.frequency === frequency.value ? "border-volt/40 bg-volt/12" : "border-line bg-slate-50 dark:bg-slate-800"}`}
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
    </div>
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

function MetricDetail({ label, value }: { label: string; value: number }) {
  return <div className="bg-slate-50 px-3 py-2 dark:bg-slate-800"><p className="text-[10px] font-bold text-muted">{label}</p><p className="mt-0.5 text-sm font-black text-ink">{value.toLocaleString("es-MX")}</p></div>;
}

function isKpiSyncMetrics(value: unknown): value is KpiSyncMetrics {
  return typeof value === "object" && value !== null && "rowsRead" in value && "ignoredRows" in value;
}

function providerLabel(provider: DataSourceProvider) {
  return providers.find((item) => item.value === provider)?.label ?? provider;
}

function frequencyLabel(frequency: DataSourceFrequency) {
  return frequencies.find((item) => item.value === frequency)?.label ?? frequency;
}

function syncResult(source?: DataSourceRecord) {
  if (!source?.latestLog) return source?.status === "ERROR" ? "Error de conexion" : "Sin validar";
  if (source.latestLog.status === "SUCCESS") return "Completado";
  if (source.latestLog.status === "RUNNING") return "En proceso";
  return source.latestLog.message || "Error";
}

function linkedFileReference(value: string) {
  try {
    const url = new URL(value);
    const fileName = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
    return fileName && fileName.includes(".") ? fileName : url.hostname;
  } catch {
    return value;
  }
}

function omitSourceResult<T>(values: Record<string, T>, sourceId: string) {
  const next = { ...values };
  delete next[sourceId];
  return next;
}

function formatDate(value?: string | null) {
  if (!value) return "Sin programar";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
