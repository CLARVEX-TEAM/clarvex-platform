"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bell,
  CalendarPlus,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  Shirt,
  Target,
  UsersRound,
  WifiOff
} from "lucide-react";
import { AppFrame, AppHeader, Button, Card, ProgressBar } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { compressImage } from "@/lib/image-compress";
import { money } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { attendanceLabel, correctionStatusLabel } from "@/lib/my-day";
import { nativeDeviceFetch, registerNativeDevice } from "@/lib/native-device-client";
import { calendarioClarvexNativo, enContenedorNativo } from "@/lib/puente-nativo";

type Correction = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  requestedStatus: string;
  requestedArrivedAt: string | null;
  requestedLeftAt: string | null;
  reason: string;
  evidenceUrl: string | null;
  status: string;
  managerNote: string | null;
  createdAt: string;
};

type MyDay = {
  date: string;
  user: { id: string; name: string; role: string; photoUrl: string | null };
  store: { name: string };
  device: { installationId: string; profile: string; appVersion: string };
  shift: { status: string; start: string | null; end: string | null; zone: string | null; summary: string } | null;
  uniform: { top: string; bottom: string; note: string | null } | null;
  attendance: {
    status: "ON_TIME" | "LATE" | "ABSENT" | "EXCUSED" | "REST" | "VACATION" | "PAID_DAY" | "INVENTORY";
    expectedAt: string | null;
    arrivedAt: string | null;
    expectedLeaveAt: string | null;
    leftAt: string | null;
    minutesLate: number;
  } | null;
  performance: { sales: number; goal: number; progress: number; transactions: number; pieces: number };
  plan: { id: string; focus: string; message: string; tasks: Array<{ id: string; title: string; completed: boolean }> } | null;
  pendings: Array<{ id: string; title: string; priority: string; status: string; dueDate: string }>;
  announcements: Array<{ id: string; title: string; body: string; date: string; read: boolean }>;
  corrections: Correction[];
  counts: { unreadAnnouncements: number; unreadNotifications: number; openPendings: number; pendingCorrections: number };
  capabilities: { canReviewCorrections: boolean; canOpenChecklist: boolean; canManageDevices: boolean };
};

type CorrectionDraft = {
  date: string;
  requestedStatus: string;
  requestedArrivedAt: string;
  requestedLeftAt: string;
  reason: string;
  evidence: File | null;
};

const CACHE_PREFIX = "clarvex-my-day-v1:";

function readCache(userId: string): MyDay | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + userId);
    return raw ? JSON.parse(raw) as MyDay : null;
  } catch {
    return null;
  }
}

function writeCache(data: MyDay) {
  try { localStorage.setItem(CACHE_PREFIX + data.user.id, JSON.stringify(data)); } catch { /* caché opcional */ }
}

function shortDate(date: string): string {
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00.000Z`));
}

function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("No se pudo leer la evidencia."));
    reader.readAsDataURL(blob);
  });
}

export default function MyDayPage() {
  const router = useRouter();
  const [data, setData] = useState<MyDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [showCorrection, setShowCorrection] = useState(false);
  const [sending, setSending] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [draft, setDraft] = useState<CorrectionDraft>({
    date: "",
    requestedStatus: "ON_TIME",
    requestedArrivedAt: "",
    requestedLeftAt: "",
    reason: "",
    evidence: null
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const session = await getSession();
      if (!session) { router.replace("/login"); return; }
      if (!enContenedorNativo()) {
        router.replace(session.role === "ASESOR" ? "/advisor" : "/manager");
        return;
      }
      await registerNativeDevice(session.checklistOnly ? "KIOSK" : "PERSONAL");
      const response = await nativeDeviceFetch("/api/app/native/my-day");
      const payload = await response.json() as MyDay & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar tu jornada.");
      setData(payload);
      writeCache(payload);
      setOffline(false);
      setDraft({
        date: payload.date,
        requestedStatus: payload.attendance?.status ?? "ON_TIME",
        requestedArrivedAt: payload.attendance?.arrivedAt ?? payload.shift?.start ?? "",
        requestedLeftAt: payload.attendance?.leftAt ?? payload.shift?.end ?? "",
        reason: "",
        evidence: null
      });
    } catch (loadError) {
      const session = await getSession().catch(() => null);
      const cached = session ? readCache(session.id) : null;
      if (cached) {
        setData(cached);
        setOffline(true);
      } else {
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar tu jornada.");
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!data) return;
    const section = new URLSearchParams(window.location.search).get("seccion");
    if (!section || !["jornada", "asistencia", "correcciones"].includes(section)) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`mi-dia-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [data]);

  const nextAction = useMemo(() => {
    const task = data?.plan?.tasks.find((item) => !item.completed);
    if (task) return { label: task.title, href: "/plan", detail: "Siguiente tarea de tu plan" };
    const pending = data?.pendings[0];
    if (pending) return { label: pending.title, href: `/pendientes`, detail: "Pendiente por resolver" };
    const announcement = data?.announcements.find((item) => !item.read);
    if (announcement) return { label: announcement.title, href: "/comunicados", detail: "Comunicado por leer" };
    return { label: "Tu jornada está al día", href: "/mi-dia", detail: "No hay acciones urgentes" };
  }, [data]);

  async function addCalendar() {
    if (!data?.shift?.start || !data.shift.end) return;
    const plugin = calendarioClarvexNativo();
    if (!plugin) { setError("Esta versión no incluye acceso al calendario."); return; }
    try {
      await plugin.agregarEvento({
        title: `Turno · ${data.store.name}`,
        date: data.date,
        start: data.shift.start,
        end: data.shift.end,
        location: data.store.name,
        notes: data.shift.zone ? `Zona: ${data.shift.zone}` : "Turno de Clarvex"
      });
      haptic("success");
    } catch {
      setError("No se pudo abrir el calendario.");
    }
  }

  async function submitCorrection(event: React.FormEvent) {
    event.preventDefault();
    if (!data) return;
    setSending(true);
    setError("");
    try {
      let evidence: { data: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; name: string } | undefined;
      if (draft.evidence) {
        const compressed = await compressImage(draft.evidence, 1800, 0.8);
        const mimeType = (compressed.type || draft.evidence.type) as "image/jpeg" | "image/png" | "image/webp";
        evidence = { data: await blobBase64(compressed), mimeType, name: draft.evidence.name };
      }
      const body = JSON.stringify({
        date: draft.date,
        requestedStatus: draft.requestedStatus,
        requestedArrivedAt: draft.requestedArrivedAt || null,
        requestedLeftAt: draft.requestedLeftAt || null,
        reason: draft.reason,
        ...(evidence ? { evidence } : {})
      });
      const response = await nativeDeviceFetch("/api/app/native/attendance-corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo enviar la solicitud.");
      haptic("success");
      setShowCorrection(false);
      await load();
    } catch (submitError) {
      haptic("error");
      setError(submitError instanceof Error ? submitError.message : "No se pudo enviar la solicitud.");
    } finally {
      setSending(false);
    }
  }

  async function reviewCorrection(id: string, action: "APPROVE" | "REJECT") {
    setReviewing(id);
    setError("");
    try {
      const response = await nativeDeviceFetch("/api/app/native/attendance-corrections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id, action })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo resolver la solicitud.");
      haptic("success");
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "No se pudo resolver la solicitud.");
    } finally {
      setReviewing(null);
    }
  }

  if (loading && !data) {
    return (
      <>
        <AppHeader title="Mi día" subtitle="Preparando tu jornada" />
        <AppFrame>
          <div className="animate-pulse space-y-3">
            <div className="h-40 rounded-2xl bg-panel" />
            <div className="h-24 rounded-2xl bg-panel" />
            <div className="h-52 rounded-2xl bg-panel" />
          </div>
        </AppFrame>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <AppHeader title="Mi día" subtitle="No pudimos abrir tu jornada" />
        <AppFrame>
          <Card className="mt-4 p-5 text-center">
            <AlertCircle className="mx-auto text-orchid" />
            <p className="mt-3 text-sm font-semibold text-ink">{error || "No hay información disponible."}</p>
            <Button onClick={() => void load()} variant="primary" className="mt-4 w-full" icon={<RefreshCw size={17} />}>Reintentar</Button>
          </Card>
        </AppFrame>
      </>
    );
  }

  const firstName = data.user.name.split(" ")[0];
  const openTasks = data.plan?.tasks.filter((task) => !task.completed) ?? [];
  const ownCorrections = data.corrections.filter((item) => item.userId === data.user.id);
  const reviewCorrections = data.capabilities.canReviewCorrections
    ? data.corrections.filter((item) => item.status === "PENDING" && item.userId !== data.user.id)
    : [];
  const calendarAvailable = Boolean(data.shift?.start && data.shift.end && calendarioClarvexNativo());

  return (
    <>
      <AppHeader
        title="Mi día"
        subtitle={`${data.store.name} · ${shortDate(data.date)}`}
        avatar={data.user.name.slice(0, 2)}
        photoUrl={data.user.photoUrl}
        profileName={data.user.name}
      />
      <AppFrame>
        {offline ? (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <WifiOff size={15} /> Mostrando la última jornada guardada.
          </div>
        ) : null}
        {error ? (
          <div className="mb-3 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
            <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-2xl bg-ink px-5 py-5 text-white shadow-[0_14px_30px_rgb(15_23_42_/_0.2)] dark:bg-white dark:text-slate-950">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.035em]">Hola, {firstName}</h2>
              <p className="mt-1 text-sm text-white/70 dark:text-slate-600">{data.shift?.summary ?? "Horario pendiente de cargar"}</p>
            </div>
            <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold dark:bg-slate-900/8">{data.device.appVersion}</span>
          </div>
          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-white/65 dark:text-slate-600">Avance de venta</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">{money(data.performance.sales)}</p>
            </div>
            <p className="text-right text-xs font-semibold text-white/65 dark:text-slate-600">{data.performance.progress}% de {money(data.performance.goal)}</p>
          </div>
          <ProgressBar value={data.performance.progress} className="mt-3 bg-white/15 dark:bg-slate-900/10" />
        </section>

        <Link href={nextAction.href} className="tappable mt-3 flex min-h-20 items-center gap-3 rounded-2xl bg-blue-50 px-4 py-3 text-blue-950 dark:bg-blue-950/35 dark:text-blue-100">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white"><Target size={19} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-blue-700 dark:text-blue-300">{nextAction.detail}</span>
            <span className="mt-0.5 block truncate text-sm font-semibold">{nextAction.label}</span>
          </span>
          <ChevronRight size={18} />
        </Link>

        <section id="mi-dia-jornada" className="mt-6 scroll-mt-24">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.025em] text-ink">Jornada</h2>
              <p className="text-xs text-muted">Horario, uniforme y asistencia</p>
            </div>
            {calendarAvailable ? (
              <button type="button" onClick={() => void addCalendar()} className="tappable flex min-h-11 items-center gap-1.5 rounded-full bg-panel px-3 text-xs font-semibold text-ink">
                <CalendarPlus size={16} /> Calendario
              </button>
            ) : null}
          </div>
          <div className="mt-3 divide-y divide-line rounded-2xl bg-card px-4 shadow-[0_8px_22px_rgb(20_21_26_/_0.07)]">
            <div id="mi-dia-asistencia" className="flex min-h-16 scroll-mt-24 items-center gap-3 py-3">
              <Clock3 size={19} className="shrink-0 text-volt" />
              <div className="min-w-0 flex-1"><p className="text-xs text-muted">Turno</p><p className="text-sm font-semibold text-ink">{data.shift?.summary ?? "Sin horario"}</p></div>
            </div>
            <Link href="/uniformes" className="tappable flex min-h-16 items-center gap-3 py-3">
              <Shirt size={19} className="shrink-0 text-volt" />
              <div className="min-w-0 flex-1"><p className="text-xs text-muted">Uniforme</p><p className="text-sm font-semibold text-ink">{data.uniform ? `${data.uniform.top} · ${data.uniform.bottom}` : "Sin configuración"}</p></div>
              <ChevronRight size={17} className="text-muted" />
            </Link>
            <div className="flex min-h-16 items-center gap-3 py-3">
              <ShieldCheck size={19} className="shrink-0 text-volt" />
              <div className="min-w-0 flex-1"><p className="text-xs text-muted">Asistencia</p><p className="text-sm font-semibold text-ink">{attendanceLabel(data.attendance)}</p></div>
              <button type="button" onClick={() => setShowCorrection((value) => !value)} className="min-h-11 rounded-full px-3 text-xs font-semibold text-volt">Corregir</button>
            </div>
          </div>
        </section>

        {showCorrection ? (
          <form onSubmit={submitCorrection} className="mt-3 rounded-2xl bg-card p-4 shadow-[0_8px_22px_rgb(20_21_26_/_0.07)]">
            <h3 className="text-base font-semibold text-ink">Solicitar corrección</h3>
            <p className="mt-1 text-xs leading-5 text-muted">Gerencia revisará el cambio antes de modificar tu asistencia.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="col-span-2 text-xs font-semibold text-muted">Fecha<input type="date" required value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-panel px-3 text-sm text-ink" /></label>
              <label className="col-span-2 text-xs font-semibold text-muted">Estado<select value={draft.requestedStatus} onChange={(event) => setDraft((current) => ({ ...current, requestedStatus: event.target.value }))} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-panel px-3 text-sm text-ink"><option value="ON_TIME">A tiempo</option><option value="LATE">Retardo</option><option value="ABSENT">Ausencia</option><option value="EXCUSED">Justificada</option><option value="REST">Descanso</option><option value="VACATION">Vacaciones</option><option value="PAID_DAY">Pago de día</option><option value="INVENTORY">Inventario</option></select></label>
              <label className="text-xs font-semibold text-muted">Entrada<input type="time" value={draft.requestedArrivedAt} onChange={(event) => setDraft((current) => ({ ...current, requestedArrivedAt: event.target.value }))} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-panel px-3 text-sm text-ink" /></label>
              <label className="text-xs font-semibold text-muted">Salida<input type="time" value={draft.requestedLeftAt} onChange={(event) => setDraft((current) => ({ ...current, requestedLeftAt: event.target.value }))} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-panel px-3 text-sm text-ink" /></label>
              <label className="col-span-2 text-xs font-semibold text-muted">Motivo<textarea required minLength={8} maxLength={500} value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} placeholder="Explica qué dato debe corregirse" className="mt-1 min-h-24 w-full resize-none rounded-xl border border-line bg-panel px-3 py-3 text-sm text-ink" /></label>
              <label className="col-span-2 text-xs font-semibold text-muted">Evidencia opcional<input type="file" accept="image/*" capture="environment" onChange={(event) => setDraft((current) => ({ ...current, evidence: event.target.files?.[0] ?? null }))} className="mt-1 block min-h-12 w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs text-ink file:mr-2 file:rounded-full file:border-0 file:bg-volt file:px-3 file:py-1.5 file:font-semibold file:text-white" /></label>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2"><Button type="button" variant="ghost" onClick={() => setShowCorrection(false)}>Cancelar</Button><Button type="submit" variant="primary" loading={sending}>Enviar</Button></div>
          </form>
        ) : null}

        <section className="mt-6">
          <div className="flex items-end justify-between">
            <div><h2 className="text-lg font-semibold tracking-[-0.025em] text-ink">Plan de hoy</h2><p className="text-xs text-muted">{openTasks.length ? `${openTasks.length} por completar` : "Todo en orden"}</p></div>
            <Link href="/plan" className="min-h-11 px-2 py-3 text-xs font-semibold text-volt">Ver plan</Link>
          </div>
          <div className="mt-2 divide-y divide-line">
            {data.plan?.tasks.length ? data.plan.tasks.slice(0, 5).map((task) => (
              <Link key={task.id} href="/plan" className="tappable flex min-h-14 items-center gap-3 py-2">
                <span className={`grid size-7 shrink-0 place-items-center rounded-full ${task.completed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-panel text-muted"}`}>{task.completed ? <Check size={15} /> : <span className="size-2 rounded-full bg-current" />}</span>
                <span className={`text-sm font-semibold ${task.completed ? "text-muted line-through" : "text-ink"}`}>{task.title}</span>
              </Link>
            )) : <p className="py-4 text-sm text-muted">No tienes tareas publicadas para hoy.</p>}
          </div>
        </section>

        {ownCorrections.length ? (
          <section className="mt-6"><h2 className="text-lg font-semibold tracking-[-0.025em] text-ink">Mis correcciones</h2><div className="mt-2 divide-y divide-line">{ownCorrections.slice(0, 3).map((item) => <div key={item.id} className="flex min-h-14 items-center justify-between gap-3 py-2"><div><p className="text-sm font-semibold text-ink">{item.date}</p><p className="text-xs text-muted">{item.reason}</p></div><span className="shrink-0 rounded-full bg-panel px-2.5 py-1 text-xs font-semibold text-ink">{correctionStatusLabel(item.status)}</span></div>)}</div></section>
        ) : null}

        {reviewCorrections.length ? (
          <section id="mi-dia-correcciones" className="mt-6 scroll-mt-24">
            <h2 className="text-lg font-semibold tracking-[-0.025em] text-ink">Por revisar</h2>
            <p className="text-xs text-muted">Solicitudes de asistencia del equipo</p>
            <div className="mt-3 space-y-3">
              {reviewCorrections.map((item) => (
                <div key={item.id} className="rounded-2xl bg-card p-4 shadow-[0_8px_22px_rgb(20_21_26_/_0.07)]">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{item.userName}</p>
                      <p className="text-xs text-muted">{item.date} · {item.requestedArrivedAt || "sin entrada"}–{item.requestedLeftAt || "sin salida"}</p>
                    </div>
                    {item.evidenceUrl ? (
                      <a href={item.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-volt">
                        Ver evidencia <ExternalLink size={13} />
                      </a>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-5 text-ink">{item.reason}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button variant="ghost" loading={reviewing === item.id} onClick={() => void reviewCorrection(item.id, "REJECT")}>No aprobar</Button>
                    <Button variant="success" loading={reviewing === item.id} onClick={() => void reviewCorrection(item.id, "APPROVE")}>Aprobar</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-6">
          <h2 className="text-lg font-semibold tracking-[-0.025em] text-ink">Accesos rápidos</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Quick href="/horarios" icon={<Clock3 size={18} />} label="Horarios" detail={data.shift?.summary ?? "Consultar"} />
            <Quick href="/pendientes" icon={<ClipboardCheck size={18} />} label="Pendientes" detail={`${data.counts.openPendings} abiertos`} />
            <Quick href="/comunicados" icon={<Megaphone size={18} />} label="Comunicados" detail={`${data.counts.unreadAnnouncements} sin leer`} />
            <Quick href="/notificaciones" icon={<Bell size={18} />} label="Avisos" detail={`${data.counts.unreadNotifications} nuevos`} />
            {data.capabilities.canOpenChecklist ? <Quick href="/checklist" icon={<Check size={18} />} label="Checklist" detail="Apertura y cierre" /> : null}
            {data.capabilities.canManageDevices ? <Quick href="/dispositivos" icon={<UsersRound size={18} />} label="Dispositivos" detail="Aprobar o revocar" /> : null}
          </div>
        </section>
      </AppFrame>
    </>
  );
}

function Quick({ href, icon, label, detail }: { href: string; icon: React.ReactNode; label: string; detail: string }) {
  return (
    <Link href={href} className="tappable flex min-h-20 items-center gap-3 rounded-2xl bg-card px-3 shadow-[0_6px_18px_rgb(20_21_26_/_0.06)]">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-panel text-volt">{icon}</span>
      <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{label}</span><span className="block truncate text-xs text-muted">{detail}</span></span>
    </Link>
  );
}
