"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, ChevronLeft, ChevronRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { AttendanceStatus } from "@/lib/attendance";
import type { User } from "@/lib/types";
import {
  currentMonth,
  dayLabel,
  balanceOf,
  dayBadges,
  fortnightOf,
  hoursMovements,
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
import { EditDayModal } from "@/components/attendance/EditDayModal";
import { AppFrame, AppHeader, Button, Card, ProfileAvatar } from "@/components/ui";
import { SegmentedTabs } from "@/components/animate-ui/SegmentedTabs";
import { cn } from "@/lib/utils";

// balanceMinutes: saldo acumulado REAL (inicial del Excel + todo lo registrado),
// no solo el del mes que se está viendo.
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
  const [reminder, setReminder] = useState<ReportReminder | null>(null);
  const [retailRange, setRetailRange] = useState<DateRange | null>(null);
  const [naturalRange, setNaturalRange] = useState<DateRange | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");

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
      const payload = await response.json() as { users: Teammate[]; records: AttendanceRecord[]; schedules: ScheduleDay[]; canEdit: boolean; retailRange?: DateRange; naturalRange?: DateRange };
      setUsers(payload.users);
      setRecords(payload.records);
      setSchedules(payload.schedules ?? []);
      setCanEdit(payload.canEdit);
      setRetailRange(payload.retailRange ?? null);
      setNaturalRange(payload.naturalRange ?? null);
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

  // El recordatorio solo aplica a gerencia (es quien captura en Blitz).
  const loadReminder = useCallback(async () => {
    if (!session || session.role === "ASESOR") return;
    try {
      const response = await fetch("/api/report-reminder", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { reminder: ReportReminder | null };
      setReminder(payload.reminder);
    } catch {
      // Sin conexión: no se pinta el aviso, pero el push ya llegó.
    }
  }, [session]);

  useEffect(() => {
    void loadReminder();
  }, [loadReminder]);

  async function confirmReminder() {
    if (!reminder) return;
    setConfirming(true);
    setConfirmError("");
    try {
      const response = await fetch("/api/report-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodKey: reminder.periodKey })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo confirmar.");
      setReminder(null);
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : "No se pudo confirmar.");
    } finally {
      setConfirming(false);
    }
  }

  // Las cifras que se reportan a nómina van por mes RETAIL: es el periodo con
  // el que se capturan retardos, domingos y festivos en Blitz.
  const retailRecords = useMemo(
    () => (retailRange ? records.filter((r) => r.date >= retailRange.start && r.date <= retailRange.end) : records),
    [records, retailRange]
  );
  const retailSchedules = useMemo(
    () => (retailRange ? schedules.filter((d) => d.date >= retailRange.start && d.date <= retailRange.end) : schedules),
    [schedules, retailRange]
  );
  // El día a día se navega por mes natural, que es como lo lee una persona.
  const naturalRecords = useMemo(
    () => (naturalRange ? records.filter((r) => r.date >= naturalRange.start && r.date <= naturalRange.end) : records),
    [records, naturalRange]
  );
  const byUser = useMemo(() => totalsByUser(retailRecords, retailSchedules), [retailRecords, retailSchedules]);
  const totals = useMemo(() => totalsFor(retailRecords, retailSchedules), [retailRecords, retailSchedules]);

  // Incidencias del periodo elegido: es lo que se teclea en Blitz.
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

  // Banco de horas: lo que la app registró este mes. El ACUMULADO parte del
  // saldo que traían del Excel (User.hoursOwed) y le suma esto.
  //
  // "Horas del mes" NO se muestra en negativo (piso en 0): el descuento de un
  // mes con saldo negativo ya vive en el Acumulado (que sí puede bajar) y en el
  // desglose del día. Verlo también aquí en rojo lo hacía parecer doble.
  const balanceFor = useCallback(
    (userId: string) => Math.max(0, balanceOf(records.filter((record) => record.userId === userId))),
    [records]
  );

  // Un asesor solo se ve a sí mismo: se le abre su detalle directo.
  const soloUser = users.length === 1 ? users[0].id : null;
  const expanded = soloUser ?? openUser;
  const detail = expanded ? naturalRecords.filter((record) => record.userId === expanded) : [];

  // Corrección manual de gerencia: solo si puede editar (GERENTE/SUBGERENTE).
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const onEditDay = canEdit ? setEditing : undefined;

  return (
    <>
      <AppHeader
        title="Asistencia"
        subtitle={canEdit ? "Llegadas, retardos y faltas del equipo." : "Tu registro de llegadas."}
        backHref={session?.role === "ASESOR" ? "/advisor" : "/manager"}
      />
      <AppFrame>
        {/* Recordatorio de entrega: el mismo que llega por push. Se puede
            confirmar aquí para que deje de avisar por ese cierre. */}
        {reminder && (
          <Card className="mb-3 border border-ember/30 bg-ember/[0.07] p-3.5">
            <div className="flex items-start gap-2.5">
              <BellRing className="mt-0.5 shrink-0 text-ember" size={18} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {reminder.kind === "QUINCENA" ? "Cierre de quincena" : "Cierre del mes retail"}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{reminder.message}</p>
                <Button
                  onClick={() => void confirmReminder()}
                  disabled={confirming}
                  className="mt-2.5 w-full"
                >
                  {confirming ? "Guardando…" : "Ya lo subí a Blitz"}
                </Button>
                {confirmError && <p className="mt-1.5 text-xs font-semibold text-orchid">{confirmError}</p>}
              </div>
            </div>
          </Card>
        )}

        {/* Selector de mes */}
        {/*
          ⚠️ El mes era una TARJETA entera para un renglon con dos flechas, con
          el mismo peso que el contenido. Ahora es el titulo de la pantalla,
          como el periodo en KPIs, y las flechas quedan a su lado.
        */}
        <div className="mb-4 flex items-center gap-1 px-1">
          <h2 className="flex-1 text-[19px] font-semibold tracking-[-0.02em] text-ink">{monthTitle(month)}</h2>
          <button type="button" aria-label="Mes anterior" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="tappable grid size-10 place-items-center rounded-full text-muted transition hover:text-ink active:scale-95">
            <ChevronLeft size={19} />
          </button>
          <button type="button" aria-label="Mes siguiente" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="tappable grid size-10 place-items-center rounded-full text-muted transition hover:text-ink active:scale-95">
            <ChevronRight size={19} />
          </button>
        </div>

        {/*
          Lo que se reporta a nomina.

          ⚠️ Eran CUATRO tarjetas con icono, cada una de un color --rojo, ambar,
          azul, morado-- y a 95 px en un telefono. Con los cuatro coloreados,
          ninguno destacaba: el rojo de una falta pesaba lo mismo que el morado
          de un festivo, que no es un aviso sino una cuenta.

          ⚠️ Ahora el color se reserva a lo que CUESTA DINERO --faltas y
          retardos-- y solo cuando hay algo que contar. Un cero en faltas es una
          buena noticia y no necesita gritar en rojo.
        */}
        <div className="mb-4 flex flex-wrap items-start gap-x-7 gap-y-3 px-1">
          <CifraNomina label="Faltas" value={totals.absences} tono={totals.absences > 0 ? "text-orchid" : "text-ink"} />
          <CifraNomina label="Retardos" value={totals.lates} tono={totals.lates > 0 ? "text-ember" : "text-ink"} />
          <CifraNomina label="Domingos" value={totals.sundaysWorked} tono="text-ink" />
          <CifraNomina label="Festivos" value={totals.holidaysWorked} tono="text-ink" />
        </div>

        {/*
          Pestanias: el dia a dia, o la lista lista para capturar en Blitz.

          ⚠️ Estaban escritas a mano, y eran una TERCERA forma de pestania en la
          misma app. Ahora usan `SegmentedTabs`, el mismo control que el
          Semana/Mes de KPIs -- y con razon: las dos cosas eligen entre dos
          formas de ver lo mismo.
        */}
        <SegmentedTabs
          ariaLabel="Vista de asistencia"
          className="mb-3"
          value={tab}
          onChange={setTab}
          options={[
            { value: "dias", label: "Día a día" },
            { value: "incidencias", label: "Incidencias" }
          ]}
        />

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
                      <p className="truncate text-[15px] font-semibold text-ink">{user.name}</p>
                      {/*
                        ⚠️ Este renglón aparece SOLO si hay algo que contar.
                        Antes decía «0 faltas · 0 retardos» en todas las
                        personas: cinco renglones diciendo que no pasó nada, con
                        el mismo peso que el de quien sí faltó. Es la misma
                        regla del pase de lista por Telegram, que manda «sin
                        novedad» y solo nombra la excepción.
                      */}
                      {novedades(userTotals, balanceFor(user.id)).length ? (
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                          {novedades(userTotals, balanceFor(user.id)).map((n) => (
                            <span key={n.texto} className={n.tono}>{n.texto}</span>
                          ))}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted">Sin novedad</p>
                      )}
                      {/* De dónde sale el acumulado. Sin esto hay que
                          reconstruirlo día por día para explicarlo. */}
                      {user.balanceSince ? (
                        <p className="mt-0.5 text-[11px] text-muted">
                          {formatBalance(user.balanceAdjustment)} de ajuste
                          {user.balanceEarned > 0 ? ` · +${formatBalance(user.balanceEarned).replace("+", "")} ganadas` : ""}
                          {user.balanceSpent > 0 ? ` · −${formatBalance(user.balanceSpent).replace("+", "")} usadas` : ""}
                        </p>
                      ) : null}
                    </div>
                    {/*
                      ⚠️ El acumulado se va a la DERECHA y en cifras tabulares,
                      para que los cinco formen una columna que se lee de arriba
                      abajo. Metido en la frase «Horas del mes: … · Acumulado:
                      …» había que leer persona por persona para compararlos.
                    */}
                    <div className="shrink-0 text-right">
                      <p className={cn(
                        "text-sm font-semibold tabular-nums",
                        user.balanceMinutes < 0 ? "text-orchid" : "text-ink"
                      )}>
                        {formatBalance(user.balanceMinutes)}
                      </p>
                      <p className="text-[10px] text-muted">acumulado</p>
                    </div>
                    <ChevronRight size={16} className={cn("shrink-0 text-muted transition-transform", open && "rotate-90")} />
                  </button>
                  {open ? <DayList records={records.filter((record) => record.userId === user.id)} onEdit={onEditDay} /> : null}
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
                  "text-2xl font-semibold",
                  balanceFor(soloUser) < 0 ? "text-orchid" : "text-mint"
                )}>
                  {formatBalance(balanceFor(soloUser))}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-muted">Saldo acumulado</p>
                <p className="text-lg font-semibold text-ink">
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
            <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-black/4 p-1 dark:bg-white/6">
              {([1, 2, "mes"] as const).map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setPeriod(value)}
                  className={cn(
                    "rounded-xl py-1.5 text-[11px] font-semibold transition",
                    period === value ? "bg-panel text-ink shadow-xs" : "text-muted"
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
      {editing ? (
        <EditDayModal
          record={editing}
          name={nameById.get(editing.userId) ?? "Colaborador"}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      ) : null}
    </>
  );
}

/**
 * Lo que se sale de lo normal en el mes de una persona.
 *
 * ⚠️ Un cero NO es una novedad. Devolver «0 faltas» obliga a leer los cinco
 * renglones para encontrar el que importa, que es justo lo que esta pantalla
 * hacia. Solo entra lo que tiene algo que contar, y con el color puesto donde
 * cuesta dinero: faltas y retardos.
 */
function novedades(
  totales: { absences: number; lates: number; sundaysWorked: number } | undefined,
  horasGanadas: number
): Array<{ texto: string; tono: string }> {
  const salida: Array<{ texto: string; tono: string }> = [];
  const faltas = totales?.absences ?? 0;
  const retardos = totales?.lates ?? 0;
  const domingos = totales?.sundaysWorked ?? 0;
  if (faltas > 0) salida.push({ texto: `${faltas} ${faltas === 1 ? "falta" : "faltas"}`, tono: "font-semibold text-orchid" });
  if (retardos > 0) salida.push({ texto: `${retardos} ${retardos === 1 ? "retardo" : "retardos"}`, tono: "font-semibold text-ember" });
  if (domingos > 0) salida.push({ texto: `${domingos} ${domingos === 1 ? "domingo" : "domingos"}`, tono: "text-muted" });
  // Las ganadas casi siempre son cero por el suelo de `balanceFor`; cuando no,
  // es buena noticia y merece decirse.
  if (horasGanadas > 0) salida.push({ texto: `+${formatBalance(horasGanadas).replace("+", "")} ganadas`, tono: "text-mint" });
  return salida;
}

/** Una cifra de nomina, sin caja: es un pie de foto del mes. */
function CifraNomina({ label, value, tono }: { label: string; value: number; tono: string }) {
  return (
    <div>
      <div className={cn("text-[22px] font-semibold tabular-nums tracking-[-0.02em]", tono)}>{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
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
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", INCIDENT_TONE[incident.kind])}>
              {incident.kind}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DayList({ records, onEdit }: { records: AttendanceRecord[]; onEdit?: (record: AttendanceRecord) => void }) {
  if (records.length === 0) {
    return <p className="px-4 py-3 text-xs font-semibold text-muted">Sin registros este mes.</p>;
  }
  return (
    <div className="divide-y divide-line/50 bg-black/2 dark:bg-white/2">
      {records.map((record) => {
        const movements = hoursMovements(record);
        const body = (
          <>
            <div className="flex items-center gap-3">
              <p className="w-14 shrink-0 text-xs font-bold text-muted">
                {dayLabel(record.date)}
                {isSunday(record.date) ? <span className="ml-1 text-volt">•</span> : null}
              </p>
              {dayBadges(record).map((badge) => (
                <span key={badge.label} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", badge.tone)}>
                  {badge.label}
                </span>
              ))}
              <div className="ml-auto text-right">
                {record.arrivedAt ? (
                  <p className="text-xs font-bold text-ink">
                    {record.arrivedAt}
                    {record.leftAt ? <span className="text-muted"> – {record.leftAt}</span> : null}
                    {record.minutesLate > 0 ? <span className="ml-1 text-ember">+{record.minutesLate}′</span> : null}
                  </p>
                ) : null}
                {/* Antes decía «corregido» cuando `source` era MANUAL. Tenía
                    sentido mientras la base venía del Excel y lo manual era la
                    excepción: marcaba la fila que alguien había tocado a mano.
                    Ahora TODA la asistencia se captura a mano desde el panel,
                    así que la etiqueta salía en todos los renglones y dejó de
                    decir nada. Queda solo la invitación a editar. */}
                {onEdit ? <p className="text-[10px] font-bold text-muted">toca para editar</p> : null}
              </div>
            </div>
            {/* Por qué se movió el banco de horas ese día. */}
            {movements.map((movement, index) => (
              <div key={index} className="mt-1 flex items-center gap-2 pl-17 text-[11px] font-semibold">
                <span className={cn("tabular-nums", movement.minutes < 0 ? "text-orchid" : "text-mint")}>
                  {formatBalance(movement.minutes)}
                </span>
                <span className="text-muted">{movement.text}</span>
              </div>
            ))}
          </>
        );
        return onEdit ? (
          <button key={record.id} type="button" onClick={() => onEdit(record)} className="w-full px-4 py-2.5 text-left transition-colors active:bg-volt/8">
            {body}
          </button>
        ) : (
          <div key={record.id} className="px-4 py-2.5">{body}</div>
        );
      })}
    </div>
  );
}
