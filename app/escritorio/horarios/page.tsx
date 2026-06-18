"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { addWeeks, dateKey, startOfWeek } from "@/lib/schedule-week";
import { SHIFT_TYPE_LABELS } from "@/lib/shift-requests";
import type { Role, User } from "@/lib/types";
import { Badge, Button, Card, ProfileAvatar, Skeleton } from "@/components/ui";

type ScheduleStatus = "WORKING" | "OFF" | "VACATION" | "PAID_DAY" | "INVENTORY" | "TERMINATED" | "UNKNOWN";
type ScheduleItem = {
  id: string;
  userId: string;
  userName: string;
  userRole: Role;
  photoUrl: string | null;
  date: string;
  day: string;
  status: ScheduleStatus;
  statusRaw: string | null;
  startTime: string | null;
  endTime: string | null;
  zone: string | null;
};
type ScheduleResponse = {
  weekStart: string;
  weekEnd: string;
  availableWeeks: string[];
  schedules: ScheduleItem[];
};

const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
const statusConfig: Record<ScheduleStatus, { label: string; tone: "success" | "default" | "warn" | "danger" | "info" }> = {
  WORKING: { label: "Laborando", tone: "success" },
  OFF: { label: "Descanso", tone: "default" },
  VACATION: { label: "Vacaciones", tone: "info" },
  PAID_DAY: { label: "Pago dia", tone: "warn" },
  INVENTORY: { label: "Conteo", tone: "warn" },
  TERMINATED: { label: "Baja", tone: "danger" },
  UNKNOWN: { label: "Sin horario", tone: "default" }
};

export default function EscritorioHorarios() {
  const [session, setSession] = useState<User | null>(null);
  const [weekStart, setWeekStart] = useState(() => dateKey(startOfWeek(new Date())));
  const [view, setView] = useState<"mine" | "team">("team");
  const [payload, setPayload] = useState<ScheduleResponse | null>(null);
  const [shiftRequests, setShiftRequests] = useState<Array<{ date: string; type: string; status: string; requester: { name: string } }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isManager = session?.role === "GERENTE" || session?.role === "SUBGERENTE";

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    fetch("/api/shift-requests", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ requests?: Array<{ date: string; type: string; status: string; requester: { name: string } }> }>)
      .then((data) => setShiftRequests((data.requests ?? []).filter((request) => request.status !== "RECHAZADO")))
      .catch(() => undefined);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ weekStart });
    if (session.role === "ASESOR" || view === "mine") params.set("userId", session.id);
    setLoading(true);
    setError("");
    fetch(`/api/schedules?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as ScheduleResponse & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "No se pudo cargar la semana.");
        setPayload(data);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "No se pudo cargar la semana.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [session, view, weekStart]);

  const days = useMemo(() => {
    const firstDay = new Date(`${weekStart}T00:00:00Z`);
    return dayNames.map((name, index) => {
      const date = new Date(firstDay.getTime() + index * 86_400_000);
      const key = dateKey(date);
      return { name, key, date, schedules: payload?.schedules.filter((item) => item.date === key) ?? [] };
    });
  }, [payload, weekStart]);

  const summary = useMemo(() => ({
    working: payload?.schedules.filter((item) => item.status === "WORKING").length ?? 0,
    off: payload?.schedules.filter((item) => item.status === "OFF").length ?? 0,
    vacation: payload?.schedules.filter((item) => item.status === "VACATION").length ?? 0,
    paid: payload?.schedules.filter((item) => item.status === "PAID_DAY").length ?? 0
  }), [payload]);

  const currentWeek = dateKey(startOfWeek(new Date()));
  const today = localDateKey(new Date());
  const rangeLabel = formatWeekRange(weekStart);

  function moveWeek(amount: number) {
    setWeekStart(dateKey(addWeeks(new Date(`${weekStart}T00:00:00Z`), amount)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isManager ? (
          <div className="flex rounded-full bg-slate-100 p-1 dark:bg-slate-800" role="group" aria-label="Vista de horarios">
            <button type="button" onClick={() => setView("team")} className={`min-h-9 rounded-full px-5 text-sm font-black transition ${view === "team" ? "bg-white text-volt shadow-sm dark:bg-slate-600" : "text-muted"}`}>Equipo</button>
            <button type="button" onClick={() => setView("mine")} className={`min-h-9 rounded-full px-5 text-sm font-black transition ${view === "mine" ? "bg-white text-volt shadow-sm dark:bg-slate-600" : "text-muted"}`}>Mi horario</button>
          </div>
        ) : <span />}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => moveWeek(-1)} className="grid size-10 place-items-center rounded-full bg-slate-100 text-ink transition hover:bg-slate-200 dark:bg-slate-800" aria-label="Semana anterior"><ChevronLeft size={18} /></button>
          <div className="min-w-44 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-volt">Semana {isoWeekNumber(new Date(`${weekStart}T00:00:00Z`))}</p>
            <p className="text-xs font-semibold text-muted">{rangeLabel}</p>
          </div>
          <button type="button" onClick={() => moveWeek(1)} className="grid size-10 place-items-center rounded-full bg-slate-100 text-ink transition hover:bg-slate-200 dark:bg-slate-800" aria-label="Semana siguiente"><ChevronRight size={18} /></button>
          <Button variant={weekStart === currentWeek ? "primary" : "ghost"} className="min-h-9 px-3 text-xs" onClick={() => setWeekStart(currentWeek)}>Actual</Button>
          <select aria-label="Semanas disponibles" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} className="min-h-9 rounded-full border border-line bg-panel px-3 text-xs font-black text-ink outline-none focus:ring-4 focus:ring-volt/20">
            {Array.from(new Set([weekStart, currentWeek, ...(payload?.availableWeeks ?? [])])).sort().reverse().map((week) => <option key={week} value={week}>{formatWeekRange(week)}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Summary label="Laborando" value={summary.working} className="text-emerald-600" />
        <Summary label="Descansos" value={summary.off} className="text-slate-600 dark:text-slate-300" />
        <Summary label="Vacaciones" value={summary.vacation} className="text-sky-600" />
        <Summary label="Pago día" value={summary.paid} className="text-amber-600" />
      </div>

      {error ? <Card className="border-rose-200 bg-rose-50 text-sm font-semibold text-rose-700">{error}</Card> : null}
      {loading ? (
        <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[28px]" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3" aria-label="Agenda semanal">
          {days.map((day) => {
            const current = day.key === today;
            const requests = shiftRequests.filter((request) => request.date === day.key);
            return (
              <Card key={day.key} className={`p-4 ${current ? "ring-2 ring-volt/30" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`grid size-10 place-items-center rounded-2xl text-sm font-black ${current ? "bg-volt text-white" : "bg-blue-50 text-volt dark:bg-blue-950/40"}`}>{day.date.getUTCDate()}</span>
                    <div><h3 className="font-black text-ink">{day.name}</h3><p className="text-[11px] text-muted">{formatLongDate(day.date)}{current ? " · Hoy" : ""}</p></div>
                  </div>
                  <CalendarDays size={18} className={current ? "text-volt" : "text-muted"} />
                </div>
                <div className="mt-3 border-t border-line pt-2.5">
                  {day.schedules.length === 0 && requests.length === 0 ? (
                    <p className="py-1 text-[12px] text-muted">Sin registros</p>
                  ) : null}
                  {day.schedules.map((item) => <ScheduleRow key={item.id} item={item} showUser={Boolean(isManager && view === "team")} />)}
                  {requests.map((request, index) => (
                    <div key={index} className="mt-1 flex items-center gap-1.5 text-[11px] font-bold">
                      <CalendarClock size={12} className={request.status === "APROBADO" ? "text-emerald-600" : "text-amber-600"} />
                      <span className={request.status === "APROBADO" ? "text-emerald-700" : "text-amber-700"}>
                        {SHIFT_TYPE_LABELS[request.type] ?? request.type} {request.status === "APROBADO" ? "aprobado" : "(pendiente)"}{isManager && view === "team" ? ` · ${request.requester.name}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScheduleRow({ item, showUser }: { item: ScheduleItem; showUser: boolean }) {
  const config = statusConfig[item.status];
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 py-1.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {showUser ? <ProfileAvatar name={item.userName} photoUrl={item.photoUrl} size="sm" className="size-8 rounded-full shadow-none" /> : null}
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-ink">{showUser ? item.userName : config.label}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">{item.startTime ? <><Clock3 size={12} />{item.startTime}{item.endTime ? ` - ${item.endTime}` : ""}</> : item.statusRaw ?? config.label}{showUser && item.zone ? ` · ${item.zone}` : ""}</p>
        </div>
      </div>
      <Badge tone={config.tone}>{config.label}</Badge>
    </div>
  );
}

function Summary({ label, value, className }: { label: string; value: number; className: string }) {
  return <Card className="px-3 py-3 text-center"><p className={`text-2xl font-black ${className}`}>{value}</p><p className="mt-0.5 text-[11px] font-bold text-muted">{label}</p></Card>;
}

function formatWeekRange(value: string) {
  const start = new Date(`${value}T00:00:00Z`);
  const end = addWeeks(start, 1);
  end.setUTCDate(end.getUTCDate() - 1);
  const startLabel = start.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
  const endLabel = end.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
  return `${startLabel} - ${endLabel}`;
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "UTC" });
}

function isoWeekNumber(date: Date) {
  const target = new Date(date.getTime());
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

function localDateKey(date: Date) {
  return dateKey(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())));
}
