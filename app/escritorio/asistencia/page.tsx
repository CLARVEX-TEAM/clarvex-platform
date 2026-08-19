"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, CalendarX2, ChevronLeft, ChevronRight, Clock, PartyPopper, Sun } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import {
  currentMonth, dayBadges, dayLabel, balanceOf, fortnightOf, hoursMovements, incidentsFor, INCIDENT_TONE,
  isSunday, STATUS_LABEL, STATUS_TONE, totalsByUser, totalsFor,
  type AttendanceRecord, type Incident, type ScheduleDay
} from "@/lib/attendance-view";
import { formatBalance } from "@/lib/hours-balance";
import { EditDayModal } from "@/components/attendance/EditDayModal";
import { ProfileAvatar } from "@/components/ui";
import { useDesktopChrome } from "@/components/desktop/DesktopChrome";
import { cn } from "@/lib/utils";
import {
  DeskButton, DeskEmpty, DeskReveal, DeskRule, DeskSection, DeskSkeleton,
  deskTd, deskTdMuted, deskTh, deskThRight, deskThead, deskTr
} from "@/components/desktop/DeskUI";

/**
 * Asistencia en escritorio.
 *
 * La versión móvil apila todo y esconde el detalle tras un acordeón, que es lo
 * correcto en un teléfono. Aquí hay ancho, así que la plantilla y el detalle de
 * la persona seleccionada van LADO A LADO: gerencia compara el equipo y revisa
 * los días de alguien sin perder de vista al resto, que es justo lo que hace al
 * cerrar quincena.
 *
 * Toda la lógica sale de `lib/attendance-view`, la misma que usa el móvil. Aquí
 * solo cambia la presentación; un arreglo de cálculo aplica a las dos.
 */

type Teammate = {
  id: string; name: string; employeeNumber: string; role: string; photoUrl: string | null;
  hoursOwed: number; balanceMinutes: number;
  /** De dónde sale el acumulado: ajuste de gerencia + ganado − descontado. */
  balanceAdjustment: number; balanceEarned: number; balanceSpent: number; balanceSince: string | null;
};
type DateRange = { start: string; end: string };
type ReportReminder = { kind: "QUINCENA" | "MES"; daysLeft: number; message: string; periodKey: string; dueDate: string };

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7);
}

function monthTitle(month: string): string {
  const label = new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function EscritorioAsistencia() {
  const { setLastUpdated } = useDesktopChrome();
  const [session, setSession] = useState<User | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [users, setUsers] = useState<Teammate[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [schedules, setSchedules] = useState<ScheduleDay[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"dias" | "incidencias">("dias");
  const [period, setPeriod] = useState<1 | 2 | "mes">("mes");
  const [reminder, setReminder] = useState<ReportReminder | null>(null);
  const [retailRange, setRetailRange] = useState<DateRange | null>(null);
  const [naturalRange, setNaturalRange] = useState<DateRange | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);

  useEffect(() => { getSession().then(setSession); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/attendance?month=${month}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const payload = await response.json() as { users: Teammate[]; records: AttendanceRecord[]; schedules: ScheduleDay[]; canEdit: boolean; retailRange?: DateRange; naturalRange?: DateRange };
      setUsers(payload.users);
      setRecords(payload.records);
      setSchedules(payload.schedules);
      setCanEdit(payload.canEdit);
      setRetailRange(payload.retailRange ?? null);
      setNaturalRange(payload.naturalRange ?? null);
      setLastUpdated(new Date());
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [month, setLastUpdated]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch("/api/report-reminder", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { reminder?: ReportReminder | null } | null) => setReminder(data?.reminder ?? null))
      .catch(() => undefined);
  }, []);

  async function confirmReminder() {
    if (!reminder) return;
    setConfirming(true);
    setConfirmError("");
    try {
      const response = await fetch("/api/report-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: reminder.kind, periodKey: reminder.periodKey })
      });
      if (!response.ok) throw new Error();
      setReminder(null);
    } catch {
      setConfirmError("No se pudo confirmar. Intenta de nuevo.");
    } finally {
      setConfirming(false);
    }
  }

  // Las cifras que se reportan a nomina van por mes RETAIL: es el periodo
  // con el que se capturan retardos, domingos y festivos en Blitz.
  const retailRecords = useMemo(
    () => (retailRange ? records.filter((r) => r.date >= retailRange.start && r.date <= retailRange.end) : records),
    [records, retailRange]
  );
  const retailSchedules = useMemo(
    () => (retailRange ? schedules.filter((d) => d.date >= retailRange.start && d.date <= retailRange.end) : schedules),
    [schedules, retailRange]
  );
  // El dia a dia se navega por mes natural, que es como lo lee una persona.
  const naturalRecords = useMemo(
    () => (naturalRange ? records.filter((r) => r.date >= naturalRange.start && r.date <= naturalRange.end) : records),
    [records, naturalRange]
  );
  const byUser = useMemo(() => totalsByUser(retailRecords, retailSchedules), [retailRecords, retailSchedules]);
  const totals = useMemo(() => totalsFor(retailRecords, retailSchedules), [retailRecords, retailSchedules]);

  const inRetail = useCallback(
    (date: string) => !retailRange || (date >= retailRange.start && date <= retailRange.end),
    [retailRange]
  );
  // «Mes completo» = mes RETAIL. Agosto natural trae cinco domingos y el
  // retail cuatro: por natural se pagaria una prima dominical de mas.
  const scoped = useMemo(
    () => (period === "mes"
      ? records.filter((record) => inRetail(record.date))
      : records.filter((record) => fortnightOf(record.date) === period && (!naturalRange || (record.date >= naturalRange.start && record.date <= naturalRange.end)))),
    [records, period, inRetail, naturalRange]
  );
  const scopedSchedules = useMemo(
    () => (period === "mes"
      ? schedules.filter((day) => inRetail(day.date))
      : schedules.filter((day) => fortnightOf(day.date) === period && (!naturalRange || (day.date >= naturalRange.start && day.date <= naturalRange.end)))),
    [schedules, period, inRetail, naturalRange]
  );
  const incidents = useMemo(() => incidentsFor(scoped, scopedSchedules), [scoped, scopedSchedules]);
  const nameById = useMemo(() => new Map(users.map((user) => [user.id, user.name])), [users]);

  // Ver el comentario de la versión móvil: el mes NO se muestra en negativo. El
  // descuento de un mes con saldo negativo ya vive en el acumulado.
  const balanceFor = useCallback(
    (userId: string) => Math.max(0, balanceOf(naturalRecords.filter((record) => record.userId === userId))),
    [naturalRecords]
  );

  const isAdvisor = session?.role === "ASESOR";
  // El asesor solo se ve a sí mismo: no hay a quién seleccionar.
  const soloUser = users.length === 1 ? users[0].id : null;
  const active = soloUser ?? selected ?? users[0]?.id ?? null;
  const detail = active ? naturalRecords.filter((record) => record.userId === active) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-ui font-medium text-muted">Asistencia</h2>
          <p className="mt-2 text-h1 font-semibold text-ink">{monthTitle(month)}</p>
          <p className="mt-1 text-ui text-muted">
            {canEdit ? "Llegadas, retardos y faltas del equipo." : "Tu registro de llegadas."}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <DeskButton type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Mes anterior">
            <ChevronLeft size={15} />
          </DeskButton>
          <DeskButton type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Mes siguiente">
            <ChevronRight size={15} />
          </DeskButton>
        </div>
      </div>

      {reminder ? (
        <div className="flex items-start gap-3 rounded-xl border border-warn/35 bg-warn/[0.08] px-4 py-3">
          <BellRing className="mt-0.5 shrink-0 text-warn" size={17} />
          <div className="min-w-0 flex-1">
            <p className="text-ui font-semibold text-ink">
              {reminder.kind === "QUINCENA" ? "Cierre de quincena" : "Cierre del mes retail"}
            </p>
            <p className="mt-0.5 text-caption leading-relaxed text-muted">{reminder.message}</p>
            {confirmError ? <p className="mt-1 text-caption font-semibold text-danger">{confirmError}</p> : null}
          </div>
          <DeskButton type="button" onClick={() => void confirmReminder()} disabled={confirming}>
            {confirming ? "Guardando…" : "Ya lo subí a Blitz"}
          </DeskButton>
        </div>
      ) : null}

      {/* Lo que se reporta a nómina. En una fila, no apilado. */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
        <Figure icon={<CalendarX2 size={15} />} label="Faltas" value={totals.absences} tone="text-danger" />
        <Figure icon={<Clock size={15} />} label="Retardos" value={totals.lates} tone="text-warn" />
        <Figure icon={<Sun size={15} />} label="Domingos" value={totals.sundaysWorked} tone="text-accent" />
        <Figure icon={<PartyPopper size={15} />} label="Festivos" value={totals.holidaysWorked} tone="text-ink" />
      </div>

      <DeskRule />

      <div className="flex gap-1.5">
        {(["dias", "incidencias"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "min-h-9 rounded-lg px-4 text-ui font-medium transition-colors",
              tab === value ? "bg-accent text-on-accent" : "text-muted hover:text-ink"
            )}
          >
            {value === "dias" ? "Día a día" : "Incidencias"}
          </button>
        ))}
      </div>

      {loading && records.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <DeskSkeleton className="h-80" />
          <DeskSkeleton className="h-80" />
        </div>
      ) : records.length === 0 ? (
        <DeskEmpty
          title="Sin registros este mes"
          hint="Se llenan conforme gerencia captura la asistencia en Captura Clarvex."
        />
      ) : tab === "dias" ? (
        <DeskReveal>
          {/* Aquí está la diferencia con el móvil: plantilla y detalle a la vez.
              En un teléfono el acordeón es correcto; en un monitor, esconder el
              detalle detrás de un clic desperdicia el ancho. */}
          <div className={cn("grid gap-6", !isAdvisor && users.length > 1 ? "lg:grid-cols-[21rem_1fr]" : "")}>
            {!isAdvisor && users.length > 1 ? (
              <DeskSection title="Equipo" hint="Elige a alguien para ver sus días.">
                <ul className="divide-y divide-line">
                  {users.map((user) => {
                    const userTotals = byUser.get(user.id);
                    const isActive = active === user.id;
                    return (
                      <li key={user.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(user.id)}
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors",
                            isActive ? "bg-accent/[0.08]" : "hover:bg-panel"
                          )}
                        >
                          <ProfileAvatar name={user.name} photoUrl={user.photoUrl} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-ui font-semibold text-ink">{user.name}</p>
                            {/* Domingos y festivos también: se reportan a nómina
                                igual que las faltas, y omitirlos obligaba a
                                abrir a cada persona para verlos. */}
                            <p className="text-caption text-muted">
                              {userTotals?.absences ?? 0} faltas · {userTotals?.lates ?? 0} retardos
                              {userTotals?.sundaysWorked ? ` · ${userTotals.sundaysWorked} domingos` : ""}
                              {userTotals?.holidaysWorked ? ` · ${userTotals.holidaysWorked} festivos` : ""}
                            </p>
                            <p className="mt-0.5 text-caption text-muted">
                              Mes{" "}
                              <span className="font-semibold text-ink">{formatBalance(balanceFor(user.id))}</span>
                              {" · Acum. "}
                              <span className={cn("font-semibold", user.balanceMinutes < 0 ? "text-danger" : "text-ink")}>
                                {formatBalance(user.balanceMinutes)}
                              </span>
                            </p>
                            {/* De dónde sale ese acumulado: ajuste de gerencia,
                                más lo ganado y menos lo usado desde el corte.
                                Reconstruirlo a mano cuesta media hora. */}
                            {user.balanceSince ? (
                              <p className="text-caption text-muted">
                                {formatBalance(user.balanceAdjustment)} de ajuste
                                {user.balanceEarned > 0 ? ` · +${formatBalance(user.balanceEarned).replace("+", "")} ganadas` : ""}
                                {user.balanceSpent > 0 ? ` · −${formatBalance(user.balanceSpent).replace("+", "")} usadas` : ""}
                              </p>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </DeskSection>
            ) : null}

            <DeskSection
              title={active ? nameById.get(active) ?? "Detalle" : "Detalle"}
              hint={canEdit ? "Toca una fila para corregir el día." : undefined}
            >
              {active && !isAdvisor && users.length === 1 ? null : null}
              {isAdvisor || soloUser ? (
                <div className="mb-4 flex flex-wrap items-end gap-x-10 gap-y-3">
                  <div>
                    <p className="text-caption font-medium text-muted">Horas de este mes</p>
                    <p className="mt-1 text-h2 font-semibold text-ink">{formatBalance(balanceFor(active ?? ""))}</p>
                  </div>
                  <div>
                    <p className="text-caption font-medium text-muted">Saldo acumulado</p>
                    <p className={cn("mt-1 text-h3 font-semibold", (users[0]?.balanceMinutes ?? 0) < 0 ? "text-danger" : "text-ink")}>
                      {formatBalance(users[0]?.balanceMinutes ?? 0)}
                    </p>
                  </div>
                </div>
              ) : null}
              <DayTable records={detail} onEdit={canEdit ? setEditing : undefined} />
            </DeskSection>
          </div>
        </DeskReveal>
      ) : (
        <DeskReveal>
          <DeskSection
            title="Incidencias"
            hint={period === "mes"
              ? "Retardos, domingos y festivos se reportan por mes."
              : "Las faltas se reportan por quincena."}
          >
            <div className="mb-4 flex gap-1.5">
              {([1, 2, "mes"] as const).map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setPeriod(value)}
                  className={cn(
                    "min-h-8 rounded-lg px-3 text-caption font-semibold transition",
                    period === value ? "bg-accent text-on-accent" : "bg-panel text-muted ring-1 ring-line hover:text-ink"
                  )}
                >
                  {value === 1 ? "1ª quincena" : value === 2 ? "2ª quincena" : "Mes completo"}
                </button>
              ))}
            </div>
            <IncidentTable incidents={incidents} nameById={nameById} />
          </DeskSection>
        </DeskReveal>
      )}

      {editing ? (
        <EditDayModal
          record={editing}
          name={nameById.get(editing.userId) ?? "Colaborador"}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      ) : null}
    </div>
  );
}

function Figure({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className={tone}>{icon}</span>
        <p className="text-caption font-medium text-muted">{label}</p>
      </div>
      <p className="mt-1 text-h2 font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

/** Los días en tabla. En móvil son tarjetas apiladas; aquí caben las columnas. */
function DayTable({ records, onEdit }: { records: AttendanceRecord[]; onEdit?: (record: AttendanceRecord) => void }) {
  if (records.length === 0) {
    return <p className="py-4 text-ui text-muted">Sin registros este mes.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse">
        <thead className={deskThead}>
          <tr>
            <th className={deskTh}>Día</th>
            <th className={deskTh}>Estado</th>
            <th className={deskThRight}>Entrada</th>
            <th className={deskThRight}>Salida</th>
            <th className={deskTh}>Banco de horas</th>
            <th className={deskTh}>Nota</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            // El mismo desglose que ya daba el móvil: no solo «−3:00», sino por
            // qué. En escritorio cabe en su propia columna, y es lo que gerencia
            // necesita para explicar un saldo sin reconstruirlo de memoria.
            const movements = hoursMovements(record);
            return (
              <tr
                key={record.date}
                className={cn(deskTr, onEdit && "cursor-pointer")}
                onClick={onEdit ? () => onEdit(record) : undefined}
              >
                <td className={deskTd}>
                  <span className={cn(isSunday(record.date) && "text-accent")}>{dayLabel(record.date)}</span>
                </td>
                <td className={deskTd}>
                  {dayBadges(record).map((badge, index) => (
                    <span key={badge.label} className={cn("font-medium", badge.tone, index > 0 && "ml-1.5")}>{badge.label}</span>
                  ))}
                </td>
                <td className={cn(deskTdMuted, "text-right tabular-nums")}>
                  {record.arrivedAt ?? "—"}
                  {record.minutesLate > 0 ? <span className="ml-1 text-amber-600 dark:text-amber-400">+{record.minutesLate}′</span> : null}
                </td>
                <td className={cn(deskTdMuted, "text-right tabular-nums")}>{record.leftAt ?? "—"}</td>
                <td className={deskTd}>
                  {movements.length === 0 ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {movements.map((movement, index) => (
                        <span key={index} className="whitespace-nowrap text-[12px]">
                          <span className={cn("font-semibold tabular-nums", movement.minutes < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                            {formatBalance(movement.minutes)}
                          </span>{" "}
                          <span className="text-muted">{movement.text}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className={deskTdMuted}>{record.note || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Lo que se teclea en Blitz, en tabla para poder copiarlo de un vistazo. */
function IncidentTable({ incidents, nameById }: { incidents: Incident[]; nameById: Map<string, string> }) {
  if (incidents.length === 0) {
    return <p className="py-4 text-ui text-muted">Sin incidencias en este periodo.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] border-collapse">
        <thead className={deskThead}>
          <tr>
            <th className={deskTh}>Colaborador</th>
            <th className={deskTh}>Día</th>
            <th className={deskTh}>Incidencia</th>
            <th className={deskTh}>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((incident, index) => (
            <tr key={`${incident.userId}-${incident.date}-${index}`} className={deskTr}>
              <td className={deskTd}>{nameById.get(incident.userId) ?? "—"}</td>
              <td className={deskTdMuted}>{dayLabel(incident.date)}</td>
              <td className={deskTd}>
                <span className={cn("rounded-full px-2 py-0.5 text-caption font-semibold", INCIDENT_TONE[incident.kind])}>{incident.kind}</span>
              </td>
              <td className={deskTdMuted}>{incident.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
