"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
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
  X,
  Clock
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
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  DeskButton, DeskPrimaryButton, DeskReveal, DeskRule, DeskSection, DeskSkeleton, deskInput
} from "@/components/desktop/DeskUI";
import { ShineBorder } from "@/components/magic/ShineBorder";

// Cada tono con los tokens del escritorio. Antes llevaba bg-blue-50 / bg-rose-50
// fijos y sus variantes dark duplicadas; ahora sale del mismo sistema de color.
const toneClass = {
  info: "border-line bg-panel text-ink-2",
  warn: "border-warn/35 bg-warn/[0.08] text-warn",
  error: "border-danger/35 bg-danger/[0.08] text-danger"
} as const;

const modules: Record<DataSourceType, { label: string; icon: typeof CalendarDays; description: string }> = {
  HORARIOS: { label: "Horarios", icon: CalendarDays, description: "Turnos, descansos y zonas." },
  KPIS: { label: "KPIs", icon: Gauge, description: "Venta, conversión y productividad." },
  METAS: { label: "Metas", icon: Target, description: "Objetivos diarios y mensuales." },
  COMISIONES: { label: "Comisiones", icon: CircleDollarSign, description: "Reglas, niveles y resultados." },
  COMUNICADOS: { label: "Comunicados", icon: Megaphone, description: "Avisos y confirmaciones de lectura." },
  DESCUENTOS_POS: { label: "Descuentos POS", icon: Tags, description: "Venta bruta, descuentos y límite permitido." },
  ASISTENCIA: { label: "Asistencia", icon: Clock, description: "Hora de llegada, retardos y faltas (hoja APERTURA)." }
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
  { value: "HOURLY", label: "Cada hora", detail: "Actualización continua" },
  { value: "DAILY", label: "Diaria", detail: "Cada 24 horas" },
  { value: "WEEKLY", label: "Semanal", detail: "Cada 7 días" }
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
  // Un fallo de sincronización no puede verse igual que un aviso normal.
  const [tone, setTone] = useState<"info" | "warn" | "error">("info");

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
      setTone("error"); setMessage(error instanceof Error ? error.message : "No se pudo cargar el Centro de Datos.");
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
      setTone("info"); setMessage("Configuración guardada.");
    } catch (error) {
      setTone("error"); setMessage(error instanceof Error ? error.message : "No se pudo guardar la fuente.");
    } finally {
      setSaving(false);
    }
  }

  async function syncSource(source: DataSourceRecord) {
    setSyncingId(source.id);
    setTone("info"); setMessage(`Sincronizando ${modules[source.type].label}…`);
    try {
      const response = await fetch(`/api/data-sources/${source.id}/sync`, { method: "POST" });
      const payload = await response.json() as { dataSource?: DataSourceRecord; message?: string; warning?: boolean; error?: string };
      if (!response.ok || !payload.dataSource) throw new Error(payload.error ?? "No se pudo sincronizar.");
      setSources((current) => current.map((item) => item.id === source.id ? payload.dataSource! : item));
      setTone(payload.warning ? "warn" : "info");
      setMessage(payload.message ?? "Sincronización completada.");
    } catch (error) {
      setTone("error"); setMessage(error instanceof Error ? error.message : "No se pudo sincronizar.");
      await fetchSources();
    } finally {
      setSyncingId(null);
    }
  }

  async function testConnection(source: DataSourceRecord) {
    setTestingId(source.id);
    setMessage(`Probando conexión de ${modules[source.type].label}…`);
    try {
      const response = await fetch(`/api/data-sources/${source.id}/test`, { method: "POST" });
      const payload = await response.json() as {
        dataSource?: DataSourceRecord;
        workbook?: { sheets: SheetSummary[]; recordsProcessed: number };
        message?: string;
        error?: string;
      };
      if (!response.ok || !payload.dataSource || !payload.workbook) {
        throw new Error(payload.error ?? "No se pudo probar la conexión.");
      }
      setSources((current) => current.map((item) => item.id === source.id ? payload.dataSource! : item));
      setTestedSheets((current) => ({ ...current, [source.id]: payload.workbook!.sheets }));
      setTestedRecords((current) => ({ ...current, [source.id]: payload.workbook!.recordsProcessed }));
      setMessage(payload.message ?? "Conexión correcta.");
    } catch (error) {
      setTone("error"); setMessage(error instanceof Error ? error.message : "No se pudo probar la conexión.");
      await fetchSources();
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Encabezado: la cifra que importa es cuántas fuentes están vivas. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-ui font-medium text-muted">Integraciones de tienda</h2>
          <p className="mt-2 text-h1 font-semibold text-ink">
            {connectedCount} <span className="text-muted">de {dataSourceTypes.length} vinculadas</span>
          </p>
          <p className="mt-1 max-w-lg text-ui text-muted">
            Excel y SharePoint alimentan KPIs, horarios y comisiones sin tocar la operación del día.
          </p>
        </div>
        <DeskPrimaryButton
          type="button"
          onClick={() => openConfig(dataSourceTypes.find((type) => !sourceByType.has(type)) ?? "HORARIOS")}
        >
          <Link2 size={15} /> Vincular fuente
        </DeskPrimaryButton>
      </div>

      {message ? (
        <p role="status" className={cn("rounded-xl border px-4 py-2.5 text-ui", toneClass[tone])}>{message}</p>
      ) : null}

      <DeskRule />

      <DeskReveal index={0}>
        <section className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3" aria-label="Módulos de datos">
          {loading
            ? dataSourceTypes.map((type) => <DeskSkeleton key={type} className="h-72" />)
            : dataSourceTypes.map((type) => {
              const item = modules[type];
              const source = sourceByType.get(type);
              const status = source?.status ?? "DISCONNECTED";
              const sheets = source ? testedSheets[source.id] ?? source.latestLog?.sheets ?? [] : [];
              const recordsProcessed = source ? source.latestLog?.recordsProcessed ?? testedRecords[source.id] : undefined;
              const kpiMetrics = source?.type === "KPIS" && isKpiSyncMetrics(source.latestLog?.details) ? source.latestLog.details : null;
              const canConnect = Boolean(source?.url && source.provider !== "MANUAL");
              const Icon = item.icon;

              const card = (
                <article className="h-full rounded-xl border border-line bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-panel text-muted">
                        <Icon size={17} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-ui font-semibold text-ink">{item.label}</h3>
                        <p className="text-caption text-muted">{item.description}</p>
                      </div>
                    </div>
                    <SourceStatus status={status} />
                  </div>

                  <div className="mt-3 flex items-center gap-2 border-y border-line py-2.5">
                    <FileSpreadsheet size={15} className="shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ui text-ink">{source?.name ?? "Sin archivo configurado"}</p>
                      {source?.url ? <p className="truncate text-caption text-muted">{linkedFileReference(source.url)}</p> : null}
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 py-3">
                    <DataPoint label="Origen" value={providerLabel(source?.provider ?? "MANUAL")} />
                    <DataPoint label="Última sync" value={formatDate(source?.lastSyncAt)} />
                    <DataPoint label="Resultado" value={syncResult(source)} />
                    <DataPoint label="Registros" value={recordsProcessed !== undefined ? `${recordsProcessed.toLocaleString("es-MX")} sincronizados` : "Sin procesar"} />
                  </dl>

                  {kpiMetrics ? (
                    <>
                      <dl className="grid grid-cols-4 gap-3 border-t border-line pt-3">
                        <MetricDetail label="Leídas" value={kpiMetrics.rowsRead} />
                        <MetricDetail label="Creados" value={kpiMetrics.recordsCreated} />
                        <MetricDetail label="Actualiz." value={kpiMetrics.recordsUpdated} />
                        <MetricDetail label="Ignoradas" value={kpiMetrics.ignoredRows} />
                      </dl>
                      {"ttlsMeta" in kpiMetrics ? (
                        <div className="mt-3 rounded-lg border border-line bg-panel px-3 py-2">
                          <p className="text-caption font-medium text-muted">Totales de la fila TTLS</p>
                          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-caption">
                            <dt className="text-muted">Tráfico</dt>
                            <dd className="text-right tabular-nums text-ink">{(kpiMetrics as KpiSyncMetrics).ttlsTraffic?.toLocaleString("es-MX") ?? "—"}</dd>
                            <dt className="text-muted">Meta</dt>
                            <dd className="text-right tabular-nums text-ink">${(kpiMetrics as KpiSyncMetrics).ttlsMeta?.toLocaleString("es-MX") ?? "—"}</dd>
                            <dt className="text-muted">Venta</dt>
                            <dd className="text-right tabular-nums text-ink">${(kpiMetrics as KpiSyncMetrics).ttlsSales?.toLocaleString("es-MX") ?? "—"}</dd>
                            <dt className="text-muted">TX</dt>
                            <dd className="text-right tabular-nums text-ink">{(kpiMetrics as KpiSyncMetrics).ttlsTransactions?.toLocaleString("es-MX") ?? "—"}</dd>
                            <dt className="text-muted">Piezas</dt>
                            <dd className="text-right tabular-nums text-ink">{(kpiMetrics as KpiSyncMetrics).ttlsPieces?.toLocaleString("es-MX") ?? "—"}</dd>
                          </dl>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {sheets.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-line bg-panel px-3 py-2">
                      <p className="text-caption font-medium text-muted">Hojas detectadas</p>
                      <dl className="mt-1 grid gap-0.5">
                        {sheets.map((sheet) => (
                          <div key={sheet.name} className="flex items-center justify-between gap-3 text-caption">
                            <dt className="truncate text-ink">{sheet.name}</dt>
                            <dd className="shrink-0 tabular-nums text-muted">{sheet.rowCount} filas</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <DeskButton
                      type="button"
                      onClick={() => source && void testConnection(source)}
                      disabled={!canConnect || testingId === source?.id || syncingId === source?.id}
                      className="col-span-2 min-h-9"
                    >
                      <Wifi size={14} className={testingId === source?.id ? "animate-pulse text-accent" : "text-accent"} />
                      {testingId === source?.id ? "Probando conexión…" : "Probar conexión"}
                    </DeskButton>
                    <DeskButton
                      type="button"
                      onClick={() => source && void syncSource(source)}
                      disabled={!canConnect || syncingId === source?.id || testingId === source?.id}
                      className="min-h-9 border-accent/35 text-accent"
                    >
                      <RefreshCw size={14} className={syncingId === source?.id ? "animate-spin" : ""} />
                      {syncingId === source?.id ? "Sincronizando…" : "Sincronizar"}
                    </DeskButton>
                    <DeskButton type="button" onClick={() => openConfig(type)} className="min-h-9">
                      <Settings2 size={14} /> Configurar
                    </DeskButton>
                  </div>
                </article>
              );

              // Una fuente en ERROR es literalmente algo sin atender: el RDV
              // dejó de alimentar KPIs y nadie se ha enterado.
              return status === "ERROR" ? (
                <ShineBorder key={type} radius="rounded-[14px]" ringPx={1.5} tone="ember">{card}</ShineBorder>
              ) : (
                <div key={type}>{card}</div>
              );
            })}
        </section>
      </DeskReveal>

      <DeskRule />

      <DeskReveal index={1}>
        <DeskSection title="Automatizaciones programadas" hint="Siguiente ejecución de cada fuente vinculada.">
          {loading ? (
            <div className="space-y-2">{[0, 1].map((i) => <DeskSkeleton key={i} className="h-12" />)}</div>
          ) : scheduledSources.length === 0 ? (
            <p className="text-ui text-muted">
              Vincula una fuente y elige una frecuencia para crear su primera automatización.
            </p>
          ) : (
            <ul className="max-w-3xl">
              {scheduledSources.map((source) => (
                <li key={source.id} className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
                  <div className="min-w-0">
                    <p className="text-ui text-ink">{modules[source.type].label}</p>
                    <p className="truncate text-caption text-muted">{source.name} · {frequencyLabel(source.frequency)}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2 text-caption text-muted">
                    {formatDate(source.nextSyncAt)} <ArrowRight size={13} className="text-accent" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DeskSection>
      </DeskReveal>

      {/* Configuración de fuente */}
      {config ? (
        <div
          className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center bg-black/55 px-3 py-10 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setConfig(null); }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-config-title"
            className="desk-floating max-h-[calc(100dvh-5rem)] w-full max-w-md overflow-y-auto rounded-2xl p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="source-config-title" className="text-lead font-semibold text-ink">
                  Configurar {modules[config.type].label}
                </h2>
                <p className="mt-1 text-caption text-muted">Los cambios se guardan para esta tienda.</p>
              </div>
              <button
                type="button"
                onClick={() => setConfig(null)}
                disabled={saving}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-panel hover:text-ink disabled:opacity-40"
                aria-label="Cerrar configuración"
              >
                <X size={17} />
              </button>
            </div>

            <form className="mt-5 grid gap-4" onSubmit={saveSource}>
              <fieldset>
                <legend className="mb-2 text-caption font-medium text-muted">Origen de datos</legend>
                <div className="grid grid-cols-3 gap-2">
                  {providers.map((provider) => {
                    const Icon = provider.icon;
                    return (
                      <button
                        key={provider.value}
                        type="button"
                        onClick={() => setConfig({ ...config, provider: provider.value })}
                        aria-pressed={config.provider === provider.value}
                        className={`grid min-h-16 place-items-center gap-1 rounded-xl border text-caption font-medium transition-colors ${
                          config.provider === provider.value
                            ? "border-accent/45 bg-accent-quiet text-accent"
                            : "border-line bg-panel text-muted hover:text-ink"
                        }`}
                      >
                        <Icon size={17} />{provider.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="grid gap-1">
                <span className="text-caption font-medium text-muted">Nombre de la fuente</span>
                <input
                  autoFocus
                  value={config.name}
                  onChange={(event) => setConfig({ ...config, name: event.target.value })}
                  className={deskInput}
                  placeholder="RDV de la tienda"
                  required
                />
              </label>

              <label className="grid gap-1">
                <span className="text-caption font-medium text-muted">
                  URL {config.provider === "MANUAL" ? "(opcional)" : ""}
                </span>
                <input
                  type="url"
                  value={config.url}
                  onChange={(event) => setConfig({ ...config, url: event.target.value })}
                  className={deskInput}
                  placeholder="https://…"
                  required={config.provider !== "MANUAL"}
                />
              </label>

              <fieldset>
                <legend className="mb-2 text-caption font-medium text-muted">Frecuencia de sincronización</legend>
                <div className="grid grid-cols-2 gap-2">
                  {frequencies.map((frequency) => (
                    <button
                      key={frequency.value}
                      type="button"
                      onClick={() => setConfig({ ...config, frequency: frequency.value })}
                      aria-pressed={config.frequency === frequency.value}
                      className={`min-h-14 rounded-xl border px-3 text-left transition-colors ${
                        config.frequency === frequency.value
                          ? "border-accent/45 bg-accent-quiet"
                          : "border-line bg-panel hover:border-line-strong"
                      }`}
                    >
                      <span className={`block text-ui font-medium ${config.frequency === frequency.value ? "text-accent" : "text-ink"}`}>
                        {frequency.label}
                      </span>
                      <span className="mt-0.5 block text-caption text-muted">{frequency.detail}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <DeskPrimaryButton type="submit" disabled={saving} className="w-full">
                <Link2 size={15} /> {saving ? "Guardando…" : "Guardar configuración"}
              </DeskPrimaryButton>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SourceStatus({ status }: { status: DataSourceStatus }) {
  const config = {
    CONNECTED: { label: "Vinculada", tone: "success" as const },
    DISCONNECTED: { label: "Sin vincular", tone: "default" as const },
    ERROR: { label: "Con error", tone: "danger" as const }
  }[status];
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="truncate text-ui text-ink">{value}</dd>
    </div>
  );
}

function MetricDetail({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-caption text-muted">{label}</dt>
      <dd className="text-ui font-medium tabular-nums text-ink">{value.toLocaleString("es-MX")}</dd>
    </div>
  );
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
  if (!source?.latestLog) return source?.status === "ERROR" ? "Error de conexión" : "Sin validar";
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
