"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { addWeeks, dateKey, startOfWeek } from "@/lib/schedule-week";
import { SHIFT_TYPE_LABELS } from "@/lib/shift-requests";
import type { Role, User } from "@/lib/types";
import { Badge, ProfileAvatar } from "@/components/ui";
import { DeskButton, DeskEmpty, DeskReveal, DeskRule, DeskSkeleton, deskInput } from "@/components/desktop/DeskUI";

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

const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const statusConfig: Record<ScheduleStatus, { label: string; tone: "success" | "default" | "warn" | "danger" | "info" }> = {
  WORKING: { label: "Laborando", tone: "success" },
  OFF: { label: "Descanso", tone: "default" },
  VACATION: { label: "Vacaciones", tone: "info" },
  PAID_DAY: { label: "Pago día", tone: "warn" },
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
    <div className="space-y-8">
      {/* Barra de control de la semana */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {isManager ? (
          <div className="flex gap-1.5" role="group" aria-label="Vista de horarios">
            {([["team", "Equipo"], ["mine", "Mi horario"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                aria-pressed={view === value}
                className={`min-h-9 rounded-lg px-4 text-ui font-medium transition-colors ${
                  view === value ? "bg-accent text-on-accent" : "border border-line bg-panel text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : <span />}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => moveWeek(-1)}
            className="grid size-9 place-items-center rounded-lg border border-line bg-panel text-ink transition-colors hover:border-line-strong"
            aria-label="Semana anterior"
          >
            <ChevronLeft size={17} />
          </button>
          <div className="min-w-44 text-center leading-tight">
            <p className="text-ui font-medium text-ink">Semana {isoWeekNumber(new Date(`${weekStart}T00:00:00Z`))}</p>
            <p className="text-caption text-muted">{rangeLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => moveWeek(1)}
            className="grid size-9 place-items-center rounded-lg border border-line bg-panel text-ink transition-colors hover:border-line-strong"
            aria-label="Semana siguiente"
          >
            <ChevronRight size={17} />
          </button>
          <DeskButton
            onClick={() => setWeekStart(currentWeek)}
            className={`min-h-9 ${weekStart === currentWeek ? "border-accent/40 text-accent" : ""}`}
          >
            Actual
          </DeskButton>
          <label className="sr-only" htmlFor="semanas">Semanas disponibles</label>
          <select
            id="semanas"
            value={weekStart}
            onChange={(event) => setWeekStart(event.target.value)}
            className={`${deskInput} min-h-9 w-auto text-caption`}
          >
            {Array.from(new Set([weekStart, currentWeek, ...(payload?.availableWeeks ?? [])])).sort().reverse().map((week) => (
              <option key={week} value={week}>{formatWeekRange(week)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Resumen: una fila separada por reglas, con el mismo lenguaje que la
          tira de indicadores del dashboard. */}
      <dl className="grid grid-cols-2 gap-y-5 sm:grid-cols-4">
        <Summary label="Laborando" value={summary.working} />
        <Summary label="Descansos" value={summary.off} />
        <Summary label="Vacaciones" value={summary.vacation} />
        <Summary label="Pago día" value={summary.paid} />
      </dl>

      <DeskRule />

      {error ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/[0.07] px-4 py-3 text-ui text-danger">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <DeskSkeleton key={i} className="h-44" />)}
        </div>
      ) : (
        <DeskReveal index={0}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7" aria-label="Agenda semanal">
            {days.map((day) => {
              const current = day.key === today;
              const requests = shiftRequests.filter((request) => request.date === day.key);
              return (
                <section
                  key={day.key}
                  className={`rounded-xl border p-4 ${current ? "border-accent/40 bg-accent-quiet" : "border-line bg-card"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-ui font-semibold text-ink">{day.name}</h3>
                      <p className="text-caption text-muted">
                        {formatLongDate(day.date)}{current ? " · hoy" : ""}
                      </p>
                    </div>
                    <CalendarDays size={16} className={current ? "shrink-0 text-accent" : "shrink-0 text-muted"} />
                  </div>

                  <div className="mt-3 border-t border-line pt-2">
                    {day.schedules.length === 0 && requests.length === 0 ? (
                      <p className="py-2 text-caption text-muted">Sin registros</p>
                    ) : null}
                    {day.schedules.map((item) => (
                      <ScheduleRow key={item.id} item={item} showUser={Boolean(isManager && view === "team")} />
                    ))}
                    {requests.map((request, index) => (
                      <p key={index} className="mt-1.5 flex items-start gap-1.5 text-caption">
                        <CalendarClock size={12} className={`mt-0.5 shrink-0 ${request.status === "APROBADO" ? "text-ok" : "text-warn"}`} />
                        <span className={request.status === "APROBADO" ? "text-ok" : "text-warn"}>
                          {SHIFT_TYPE_LABELS[request.type] ?? request.type}{" "}
                          {request.status === "APROBADO" ? "aprobado" : "(pendiente)"}
                          {isManager && view === "team" ? ` · ${request.requester.name}` : ""}
                        </span>
                      </p>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </DeskReveal>
      )}

      {!loading && !error && days.every((day) => day.schedules.length === 0) ? (
        <DeskEmpty
          icon={CalendarDays}
          title="Sin horarios para esta semana"
          hint="Se cargan desde Captura Clarvex. Prueba también con otra semana."
        />
      ) : null}
    </div>
  );
}

function ScheduleRow({ item, showUser }: { item: ScheduleItem; showUser: boolean }) {
  const config = statusConfig[item.status];
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        {showUser ? (
          <ProfileAvatar name={item.userName} photoUrl={item.photoUrl} size="sm" className="size-6 shrink-0 rounded-md text-[9px] shadow-none" />
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-caption font-medium text-ink">{showUser ? item.userName : config.label}</p>
          <p className="flex items-center gap-1 truncate text-caption text-muted">
            {item.startTime ? (
              <><Clock3 size={11} className="shrink-0" />{item.startTime}{item.endTime ? `–${item.endTime}` : ""}</>
            ) : (item.statusRaw ?? config.label)}
            {showUser && item.zone ? ` · ${item.zone}` : ""}
          </p>
        </div>
      </div>
      {item.status !== "WORKING" ? <Badge tone={config.tone}>{config.label}</Badge> : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="sm:border-l sm:border-line sm:pl-5 sm:first:border-l-0 sm:first:pl-0">
      <dt className="text-caption font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-h2 font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
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
