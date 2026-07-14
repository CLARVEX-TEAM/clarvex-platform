"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarX2, ChevronLeft, ChevronRight, Clock, PartyPopper, Sun } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import {
  currentMonth,
  dayLabel,
  balanceOf,
  fortnightOf,
  incidentsFor,
  INCIDENT_TONE,
  isSunday,
  STATUS_LABEL,
  STATUS_TONE,
  totalsByUser,
  totalsFor,
  type AttendanceRecord,
  type Incident,
  type ScheduleDay
} from "@/lib/attendance-view";
import { formatBalance } from "@/lib/hours-balance";
import { AppFrame, AppHeader, BottomNav, Card, ProfileAvatar } from "@/components/ui";
import { cn } from "@/lib/utils";

// balanceMinutes: saldo acumulado REAL (inicial del Excel + todo lo registrado),
// no solo el del mes que se está viendo.
type Teammate = { id: string; name: string; employeeNumber: string; role: string; photoUrl: string | null; hoursOwed: number; balanceMinutes: number };

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function monthTitle(month: string): string {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  const label = date.toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function AsistenciaPage() {
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [users, setUsers] = useState<Teammate[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  // Los horarios traen meses de historia: de ahí salen los domingos y festivos
  // trabajados de antes de que la asistencia empezara a capturarse.
  const [schedules, setSchedules] = useState<ScheduleDay[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"dias" | "incidencias">("dias");
  // Las faltas se reportan por quincena; los retardos y festivos, por mes.
  const [period, setPeriod] = useState<1 | 2 | "mes">("mes");

  useEffect(() => {
    getSession().then((current) => {
      if (!current) router.replace("/login");
      else setSession(current);
    });
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/attendance?month=${month}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const payload = await response.json() as { users: Teammate[]; records: AttendanceRecord[]; schedules: ScheduleDay[]; canEdit: boolean };
      setUsers(payload.users);
      setRecords(payload.records);
      setSchedules(payload.schedules ?? []);
      setCanEdit(payload.canEdit);
    } catch {
      // Sin conexión: se deja lo que ya estaba en pantalla.
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (!session) return;
    void load();
  }, [session, load]);

  const byUser = useMemo(() => totalsByUser(records, schedules), [records, schedules]);
  const totals = useMemo(() => totalsFor(records, schedules), [records, schedules]);

  // Incidencias del periodo elegido: es lo que se teclea en Blitz.
  const scoped = useMemo(
    () => (period === "mes" ? records : records.filter((record) => fortnightOf(record.date) === period)),
    [records, period]
  );
  const scopedSchedules = useMemo(
    () => (period === "mes" ? schedules : schedules.filter((day) => fortnightOf(day.date) === period)),
    [schedules, period]
  );
  const incidents = useMemo(() => incidentsFor(scoped, scopedSchedules), [scoped, scopedSchedules]);
  const nameById = useMemo(() => new Map(users.map((user) => [user.id, user.name])), [users]);

  // Banco de horas: lo que la app registró este mes. El ACUMULADO parte del
  // saldo que traían del Excel (User.hoursOwed) y le suma esto.
  const balanceFor = useCallback(
    (userId: string) => balanceOf(records.filter((record) => record.userId === userId)),
    [records]
  );

  // Un asesor solo se ve a sí mismo: se le abre su detalle directo.
  const soloUser = users.length === 1 ? users[0].id : null;
  const expanded = soloUser ?? openUser;
  const detail = expanded ? records.filter((record) => record.userId === expanded) : [];

  return (
    <>
      <AppHeader
        title="Asistencia"
        subtitle={canEdit ? "Llegadas, retardos y faltas del equipo." : "Tu registro de llegadas."}
        backHref={session?.role === "ASESOR" ? "/advisor" : "/manager"}
      />
      <AppFrame>
        {/* Selector de mes */}
        <Card className="mb-3 flex items-center justify-between p-3">
          <button type="button" aria-label="Mes anterior" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="grid size-9 place-items-center rounded-full text-muted transition active:scale-95">
            <ChevronLeft size={18} />
          </button>
          <p className="text-sm font-black text-ink">{monthTitle(month)}</p>
          <button type="button" aria-label="Mes siguiente" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="grid size-9 place-items-center rounded-full text-muted transition active:scale-95">
            <ChevronRight size={18} />
          </button>
        </Card>

        {/* Lo que se reporta a nómina */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          <SummaryTile icon={<CalendarX2 size={15} />} label="Faltas" value={totals.absences} tone="text-rose-600 dark:text-rose-400" />
          <SummaryTile icon={<Clock size={15} />} label="Retardos" value={totals.lates} tone="text-amber-600 dark:text-amber-400" />
          <SummaryTile icon={<Sun size={15} />} label="Domingos" value={totals.sundaysWorked} tone="text-blue-600 dark:text-blue-400" />
          <SummaryTile icon={<PartyPopper size={15} />} label="Festivos" value={totals.holidaysWorked} tone="text-violet-600 dark:text-violet-400" />
        </div>

        {/* Pestañas: el día a día, o la lista lista para capturar en Blitz. */}
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
          {(["dias", "incidencias"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "rounded-xl py-2 text-xs font-black transition",
                tab === value ? "bg-panel text-ink shadow-sm" : "text-muted"
              )}
            >
              {value === "dias" ? "Día a día" : "Incidencias"}
            </button>
          ))}
        </div>

        {loading && records.length === 0 ? (
          <Card className="text-sm font-semibold text-muted">Cargando asistencia…</Card>
        ) : records.length === 0 ? (
          <Card className="text-sm font-semibold text-muted">
            Sin registros de asistencia este mes. Se llenan solos conforme el archivo de Asistencia se sincroniza.
          </Card>
        ) : null}

        {/* Equipo (solo gerencia) */}
        {tab === "dias" && canEdit && users.length > 1 ? (
          <Card className="mb-3 overflow-hidden p-0">
            {users.map((user, index) => {
              const userTotals = byUser.get(user.id);
              const open = openUser === user.id;
              return (
                <div key={user.id} className={index < users.length - 1 ? "border-b border-line/50" : ""}>
                  <button
                    type="button"
                    onClick={() => setOpenUser(open ? null : user.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-volt/8"
                  >
                    <ProfileAvatar name={user.name} photoUrl={user.photoUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{user.name}</p>
                      <p className="text-xs text-muted">
                        {userTotals?.absences ?? 0} faltas · {userTotals?.lates ?? 0} retardos
                        {userTotals?.sundaysWorked ? ` · ${userTotals.sundaysWorked} domingos` : ""}
                      </p>
                      <p className="text-[11px] font-bold text-muted">
                        Horas del mes:{" "}
                        <span className={cn(balanceFor(user.id) < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                          {formatBalance(balanceFor(user.id))}
                        </span>
                        {" · Acumulado: "}
                        <span className="text-ink/70">{formatBalance(user.balanceMinutes)}</span>
                      </p>
                    </div>
                    <ChevronRight size={16} className={cn("shrink-0 text-muted transition-transform", open && "rotate-90")} />
                  </button>
                  {open ? <DayList records={records.filter((record) => record.userId === user.id)} /> : null}
                </div>
              );
            })}
          </Card>
        ) : null}

        {/* Asesor: su banco de horas + su detalle */}
        {tab === "dias" && soloUser ? (
          <>
            <Card className="mb-3 flex items-center justify-between p-3.5">
              <div>
                <p className="text-xs font-bold text-muted">Horas de este mes</p>
                <p className={cn(
                  "text-2xl font-black",
                  balanceFor(soloUser) < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                )}>
                  {formatBalance(balanceFor(soloUser))}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-muted">Saldo acumulado</p>
                <p className="text-lg font-black text-ink">
                  {formatBalance(users[0]?.balanceMinutes ?? 0)}
                </p>
              </div>
            </Card>
            <Card className="overflow-hidden p-0">
              <DayList records={detail} />
            </Card>
          </>
        ) : null}

        {/* Incidencias: lo que se teclea en Blitz */}
        {tab === "incidencias" ? (
          <>
            <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
              {([1, 2, "mes"] as const).map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setPeriod(value)}
                  className={cn(
                    "rounded-xl py-1.5 text-[11px] font-black transition",
                    period === value ? "bg-panel text-ink shadow-sm" : "text-muted"
                  )}
                >
                  {value === 1 ? "1ª quincena" : value === 2 ? "2ª quincena" : "Mes completo"}
                </button>
              ))}
            </div>
            <p className="mb-2 px-1 text-[11px] font-semibold text-muted">
              {period === "mes"
                ? "Retardos, domingos y festivos se reportan por mes."
                : "Las faltas se reportan por quincena."}
            </p>
            <IncidentList incidents={incidents} nameById={nameById} />
          </>
        ) : null}
      </AppFrame>
      <BottomNav />
    </>
  );
}

function SummaryTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <Card className="p-3 text-center">
      <span className={cn("mx-auto grid size-8 place-items-center", tone)}>{icon}</span>
      <p className={cn("mt-1 text-xl font-black", tone)}>{value}</p>
      <p className="text-[11px] font-bold text-muted">{label}</p>
    </Card>
  );
}

/**
 * La lista que se lee para capturar en Blitz. Cada renglón es una incidencia
 * suelta con su fecha, la persona y el detalle — nada que volver a contar.
 */
function IncidentList({ incidents, nameById }: { incidents: Incident[]; nameById: Map<string, string> }) {
  if (incidents.length === 0) {
    return (
      <Card className="text-sm font-semibold text-muted">
        Sin incidencias en este periodo. 🎉
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden p-0">
      <div className="divide-y divide-line/50">
        {incidents.map((incident, index) => (
          <div key={`${incident.userId}-${incident.date}-${incident.kind}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
            <p className="w-14 shrink-0 text-xs font-bold text-muted">{dayLabel(incident.date)}</p>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{nameById.get(incident.userId) ?? "—"}</p>
              <p className="truncate text-[11px] text-muted">{incident.detail}</p>
            </div>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black", INCIDENT_TONE[incident.kind])}>
              {incident.kind}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DayList({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) {
    return <p className="px-4 py-3 text-xs font-semibold text-muted">Sin registros este mes.</p>;
  }
  return (
    <div className="divide-y divide-line/50 bg-black/[0.02] dark:bg-white/[0.02]">
      {records.map((record) => (
        <div key={record.id} className="flex items-center gap-3 px-4 py-2.5">
          <p className="w-14 shrink-0 text-xs font-bold text-muted">
            {dayLabel(record.date)}
            {isSunday(record.date) ? <span className="ml-1 text-blue-500">•</span> : null}
          </p>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-black", STATUS_TONE[record.status])}>
            {STATUS_LABEL[record.status]}
          </span>
          <div className="ml-auto text-right">
            {record.arrivedAt ? (
              <p className="text-xs font-bold text-ink">
                {record.arrivedAt}
                {record.minutesLate > 0 ? <span className="ml-1 text-amber-600 dark:text-amber-400">+{record.minutesLate}′</span> : null}
              </p>
            ) : null}
            {record.source === "MANUAL" ? <p className="text-[10px] font-bold text-muted">corregido</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
