"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarHeart, CheckCircle2, Clock3, UsersRound } from "lucide-react";
import { completion } from "@/lib/format";
import { dateKey, startOfWeek } from "@/lib/schedule-week";
import type { Role } from "@/lib/types";
import { Badge, ProfileAvatar } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useDesktopData } from "@/components/desktop/useDesktopData";
import { DesktopError } from "@/components/desktop/DesktopError";
import { SaldosEquipo } from "@/components/desktop/SaldosEquipo";
import {
  DeskButton, DeskEmpty, DeskMeter, DeskReveal, DeskRule, DeskSection, DeskSkeleton,
  deskInput, deskTd, deskTdMuted, deskTh, deskThead, deskTr
} from "@/components/desktop/DeskUI";

type EditRow = { id: string; name: string; photoUrl?: string | null; birthDate: string; hireDate: string; hoursOwed: string; vacationDays: string; paidDays: string };

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

const roleLabel: Record<string, string> = { GERENTE: "Gerente", SUBGERENTE: "Subgerente", ASESOR: "Asesor" };
const roleTone = (role: string) => (role === "GERENTE" ? "warn" : role === "SUBGERENTE" ? "info" : "default") as Parameters<typeof Badge>[0]["tone"];

const statusConfig: Record<ScheduleStatus, { label: string; tone: Parameters<typeof Badge>[0]["tone"] }> = {
  WORKING: { label: "Laborando", tone: "success" },
  OFF: { label: "Descanso", tone: "default" },
  VACATION: { label: "Vacaciones", tone: "info" },
  PAID_DAY: { label: "Pago día", tone: "warn" },
  INVENTORY: { label: "Conteo", tone: "warn" },
  TERMINATED: { label: "Baja", tone: "danger" },
  UNKNOWN: { label: "Sin horario", tone: "default" }
};

const dayAbbr = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default function EscritorioEquipo() {
  const { data, error, reload } = useDesktopData();
  const toast = useToast();
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [editRows, setEditRows] = useState<EditRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const weekStart = useMemo(() => dateKey(startOfWeek(new Date())), []);
  const todayKey = useMemo(() => {
    const now = new Date();
    return dateKey(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  }, []);
  // Los siete días de la semana en curso: son las columnas de la matriz de
  // horarios, y deben existir aunque alguien no tenga turno ese día.
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const day = new Date(`${weekStart}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() + i);
      return dateKey(day);
    }),
    [weekStart]
  );

  useEffect(() => {
    fetch(`/api/schedules?weekStart=${weekStart}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ schedules?: ScheduleItem[] }>)
      .then((payload) => setSchedules(payload.schedules ?? []))
      .catch(() => setSchedules([]));
  }, [weekStart]);

  // Filas editables de fechas/saldos del equipo (paridad con la app móvil).
  useEffect(() => {
    if (!data) return;
    setEditRows(data.users.map((u) => ({
      id: u.id, name: u.name, photoUrl: u.photoUrl,
      birthDate: u.birthDate ?? "", hireDate: u.hireDate ?? "",
      // ⚠️ `vacationBaseline`, NO `vacationDays`. El segundo es el saldo YA
      // CALCULADO (base + ganado − tomado); precargarlo aquí hacía que al
      // guardar la fila se escribiera ese número como si fuera la base, y a
      // partir de ahí lo ganado y lo tomado se contaban dos veces. El saldo se
      // desviaba cada vez que alguien guardaba, en silencio.
      //
      // En la pantalla del móvil ya estaba bien; esto es la misma corrección
      // que no se portó a escritorio.
      hoursOwed: String(u.hoursOwed ?? 0), vacationDays: String(u.vacationBaseline ?? u.vacationDays ?? 0), paidDays: String(u.paidDays ?? 0)
    })));
  }, [data]);

  function updateRow(id: string, field: "birthDate" | "hireDate" | "hoursOwed" | "vacationDays" | "paidDays", value: string) {
    setEditRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
    setSavedId(null);
  }

  async function saveRow(row: EditRow) {
    setSavingId(row.id);
    setSavedId(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.id, birthDate: row.birthDate || null, hireDate: row.hireDate || null, hoursOwed: Number(row.hoursOwed) || 0, vacationDays: Number(row.vacationDays) || 0, paidDays: Number(row.paidDays) || 0 })
      });
      if (!response.ok) throw new Error();
      setSavedId(row.id);
      window.setTimeout(() => setSavedId((current) => (current === row.id ? null : current)), 2500);
    } catch {
      toast(`No se pudo guardar ${row.name}.`, "error");
    } finally {
      setSavingId(null);
    }
  }

  if (error && !data) return <DesktopError onRetry={reload} />;
  if (!data) {
    return (
      <div className="space-y-9">
        <div className="grid gap-10 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-3">
            <DeskSkeleton className="h-4 w-32" />
            {[0, 1, 2, 3, 4].map((i) => <DeskSkeleton key={i} className="h-12" />)}
          </div>
          <div className="space-y-3">
            <DeskSkeleton className="h-4 w-40" />
            {[0, 1, 2].map((i) => <DeskSkeleton key={i} className="h-24" />)}
          </div>
        </div>
      </div>
    );
  }

  const order: Record<string, number> = { GERENTE: 0, SUBGERENTE: 1, ASESOR: 2 };
  const members = [...data.users].sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.name.localeCompare(b.name));

  const progressFor = (id: string) => {
    const kpi = data.kpis.find((k) => k.userId === id && k.date === todayKey);
    if (!kpi || (kpi.dailyGoal ?? 0) === 0) return null;
    return completion(kpi.dailySales, kpi.dailyGoal);
  };
  const todayStatus = (id: string) => schedules.find((s) => s.userId === id && s.date === todayKey)?.status ?? null;
  const weekFor = (id: string) => schedules.filter((s) => s.userId === id).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-9">
      <DeskReveal index={0}>
          <DeskSection title={`Equipo · ${members.length} personas`}>
            {/* Tope de ancho: con solo tres columnas repartidas sobre 1536px,
                nombre y alcance quedaban tan lejos que dejaban de leerse como
                la misma fila. La matriz de horarios de abajo sí usa todo el
                ancho, porque ahí las columnas son siete. */}
            <table className="w-full max-w-5xl">
              <caption className="sr-only">Colaboradores, su estado de hoy y su alcance</caption>
              <thead className={deskThead}>
                <tr>
                  <th scope="col" className={deskTh}>Colaborador</th>
                  <th scope="col" className={deskTh}>Hoy</th>
                  <th scope="col" className={`${deskTh} w-40 pl-4`}>Alcance</th>
                </tr>
              </thead>
              <tbody>
                {members.map((u) => {
                  const progress = progressFor(u.id);
                  const status = todayStatus(u.id);
                  return (
                    <tr key={u.id} className={deskTr}>
                      <td className={deskTd}>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <ProfileAvatar name={u.name} photoUrl={u.photoUrl} size="sm" className="size-8 shrink-0 rounded-lg text-[10px] shadow-none" />
                          <div className="min-w-0">
                            <p className="truncate text-ink">{u.name}</p>
                            <p className="text-caption text-muted">
                              {roleLabel[u.role] ?? u.role} · #{u.employeeNumber}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className={deskTd}>
                        {status ? <Badge tone={statusConfig[status].tone}>{statusConfig[status].label}</Badge> : <span className="text-caption text-muted">—</span>}
                      </td>
                      <td className={`${deskTd} pl-4`}>
                        {u.role !== "ASESOR" ? <span className="text-caption text-muted">Meta de tienda</span>
                          : status && status !== "WORKING" ? <span className="text-caption text-muted">{statusConfig[status].label}</span>
                          : progress === null ? <span className="text-caption text-muted">—</span> : (
                            <div className="flex items-center gap-2.5">
                              <DeskMeter value={progress} className="flex-1" />
                              <span className="w-10 shrink-0 text-right text-caption font-medium text-ink">{progress}%</span>
                            </div>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DeskSection>
        </DeskReveal>

      <DeskRule />

      {/* Matriz personas × días. En columna estrecha esto eran seis listas
          apiladas de 7 chips cada una: 900px de alto y 400px de vacío al lado
          de la tabla de equipo. En escritorio un horario semanal ES una
          cuadrícula, y así además se comparan turnos entre personas de un
          vistazo, que es justo lo que el gerente necesita. */}
      {/* Los saldos van ANTES de horarios y de la tabla editable: es la
          pregunta que se hace primero --«¿cuánto le debo a cada quien?»-- y la
          que hoy no se podía responder sin abrir persona por persona. */}
      <DeskReveal index={1}>
        <DeskSection
          title="Saldos del equipo"
          hint="Horas, días pagados y vacaciones que le quedan HOY a cada persona. Debajo de cada número, de dónde sale."
        >
          <SaldosEquipo gente={members} />
        </DeskSection>
      </DeskReveal>

      <DeskReveal index={2}>
        <DeskSection
          title="Horarios de la semana"
          hint="Una fila por persona, una columna por día. El día de hoy va resaltado."
        >
          {schedules.length === 0 ? (
            <DeskEmpty
              icon={UsersRound}
              title="Sin horarios cargados para esta semana"
              hint="Aparecen en cuanto gerencia guarda los horarios en Captura Clarvex."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px]">
                <caption className="sr-only">Horario semanal de cada colaborador</caption>
                <thead className={deskThead}>
                  <tr>
                    <th scope="col" className={`${deskTh} w-56`}>Colaborador</th>
                    {weekDates.map((date) => {
                      const day = new Date(`${date}T00:00:00Z`);
                      const isToday = date === todayKey;
                      return (
                        <th
                          key={date}
                          scope="col"
                          className={`${deskTh} pl-3 ${isToday ? "text-accent" : ""}`}
                        >
                          {dayAbbr[day.getUTCDay()]} {day.getUTCDate()}
                          {isToday ? <span className="sr-only"> (hoy)</span> : null}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {members.map((u) => {
                    const byDate = new Map(weekFor(u.id).map((s) => [s.date, s]));
                    if (byDate.size === 0) return null;
                    return (
                      <tr key={u.id} className={deskTr}>
                        <td className={deskTd}>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <ProfileAvatar name={u.name} photoUrl={u.photoUrl} size="sm" className="size-7 shrink-0 rounded-lg text-[10px] shadow-none" />
                            <span className="truncate">{u.name}</span>
                          </div>
                        </td>
                        {weekDates.map((date) => {
                          const shift = byDate.get(date);
                          const isToday = date === todayKey;
                          return (
                            <td key={date} className={`py-2.5 pl-3 ${isToday ? "bg-accent-quiet" : ""}`}>
                              {!shift ? (
                                <span className="text-caption text-muted">—</span>
                              ) : shift.status === "WORKING" && shift.startTime ? (
                                <span className="flex items-center gap-1 whitespace-nowrap text-caption text-ink">
                                  <Clock3 size={11} className="shrink-0 text-muted" />
                                  {shift.startTime}{shift.endTime ? `–${shift.endTime}` : ""}
                                </span>
                              ) : (
                                <Badge tone={statusConfig[shift.status].tone}>{statusConfig[shift.status].label}</Badge>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DeskSection>
      </DeskReveal>

      <DeskRule />

      <DeskReveal index={3}>
        <DeskSection
          title="Fechas y saldos del equipo"
          hint="Cumpleaños, ingreso y saldos. Se guarda persona por persona."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <caption className="sr-only">Fechas y saldos editables de cada colaborador</caption>
              <thead className={deskThead}>
                <tr>
                  <th scope="col" className={deskTh}>Colaborador</th>
                  <th scope="col" className={`${deskTh} pl-3`}>Cumpleaños</th>
                  <th scope="col" className={`${deskTh} pl-3`}>Ingreso</th>
                  <th scope="col" className={`${deskTh} pl-3`}>Horas saldo</th>
                  <th scope="col" className={`${deskTh} pl-3`}>Vacaciones</th>
                  <th scope="col" className={`${deskTh} pl-3`}>Pago día</th>
                  <th scope="col" className={`${deskTh} pl-3`}><span className="sr-only">Guardar</span></th>
                </tr>
              </thead>
              <tbody>
                {editRows.map((row) => (
                  <tr key={row.id} className="border-b border-line align-middle last:border-b-0">
                    <td className={deskTd}>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <ProfileAvatar name={row.name} photoUrl={row.photoUrl} size="sm" className="size-7 shrink-0 rounded-lg text-[10px] shadow-none" />
                        <span className="truncate text-ink">{row.name}</span>
                      </div>
                    </td>
                    <td className="py-2 pl-3">
                      <label className="sr-only" htmlFor={`birth-${row.id}`}>Cumpleaños de {row.name}</label>
                      <input id={`birth-${row.id}`} type="date" value={row.birthDate} onChange={(e) => updateRow(row.id, "birthDate", e.target.value)} className={deskInput} />
                    </td>
                    <td className="py-2 pl-3">
                      <label className="sr-only" htmlFor={`hire-${row.id}`}>Ingreso de {row.name}</label>
                      <input id={`hire-${row.id}`} type="date" value={row.hireDate} onChange={(e) => updateRow(row.id, "hireDate", e.target.value)} className={deskInput} />
                    </td>
                    <td className="py-2 pl-3">
                      <label className="sr-only" htmlFor={`hours-${row.id}`}>Horas saldo de {row.name}</label>
                      <input id={`hours-${row.id}`} type="number" step="0.5" inputMode="decimal" value={row.hoursOwed} onChange={(e) => updateRow(row.id, "hoursOwed", e.target.value)} className={`${deskInput} w-24`} />
                    </td>
                    <td className="py-2 pl-3">
                      <label className="sr-only" htmlFor={`vac-${row.id}`}>Vacaciones de {row.name}</label>
                      <input id={`vac-${row.id}`} type="number" step="1" min="0" inputMode="numeric" value={row.vacationDays} onChange={(e) => updateRow(row.id, "vacationDays", e.target.value)} className={`${deskInput} w-24`} />
                    </td>
                    <td className="py-2 pl-3">
                      <label className="sr-only" htmlFor={`paid-${row.id}`}>Pago día de {row.name}</label>
                      <input id={`paid-${row.id}`} type="number" step="1" min="0" inputMode="numeric" value={row.paidDays} onChange={(e) => updateRow(row.id, "paidDays", e.target.value)} className={`${deskInput} w-24`} />
                    </td>
                    <td className="py-2 pl-3">
                      {savedId === row.id ? (
                        <span className="flex items-center gap-1 whitespace-nowrap text-caption font-medium text-ok">
                          <CheckCircle2 size={15} /> Guardado
                        </span>
                      ) : (
                        <DeskButton type="button" onClick={() => void saveRow(row)} disabled={savingId === row.id}>
                          {savingId === row.id ? "Guardando…" : "Guardar"}
                        </DeskButton>
                      )}
                    </td>
                  </tr>
                ))}
                {editRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8">
                      <DeskEmpty icon={CalendarHeart} title="Sin colaboradores todavía" hint="Los horarios se capturan en Captura Clarvex." />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </DeskSection>
      </DeskReveal>
    </div>
  );
}
