"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarX2, ChevronLeft, ChevronRight, Clock, Sun } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import {
  currentMonth,
  dayLabel,
  isSunday,
  STATUS_LABEL,
  STATUS_TONE,
  totalsByUser,
  totalsFor,
  type AttendanceRecord
} from "@/lib/attendance-view";
import { AppFrame, AppHeader, BottomNav, Card, ProfileAvatar } from "@/components/ui";
import { cn } from "@/lib/utils";

type Teammate = { id: string; name: string; employeeNumber: string; role: string; photoUrl: string | null };

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
  const [canEdit, setCanEdit] = useState(false);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      const payload = await response.json() as { users: Teammate[]; records: AttendanceRecord[]; canEdit: boolean };
      setUsers(payload.users);
      setRecords(payload.records);
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

  const byUser = useMemo(() => totalsByUser(records), [records]);
  const totals = useMemo(() => totalsFor(records), [records]);

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
        <div className="mb-3 grid grid-cols-3 gap-2">
          <SummaryTile icon={<CalendarX2 size={16} />} label="Faltas" value={totals.absences} tone="text-rose-600 dark:text-rose-400" />
          <SummaryTile icon={<Clock size={16} />} label="Retardos" value={totals.lates} tone="text-amber-600 dark:text-amber-400" />
          <SummaryTile icon={<Sun size={16} />} label="Domingos" value={totals.sundaysWorked} tone="text-blue-600 dark:text-blue-400" />
        </div>

        {loading && records.length === 0 ? (
          <Card className="text-sm font-semibold text-muted">Cargando asistencia…</Card>
        ) : records.length === 0 ? (
          <Card className="text-sm font-semibold text-muted">
            Sin registros de asistencia este mes. Se llenan solos conforme el archivo de Asistencia se sincroniza.
          </Card>
        ) : null}

        {/* Equipo (solo gerencia) */}
        {canEdit && users.length > 1 ? (
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
                    </div>
                    <ChevronRight size={16} className={cn("shrink-0 text-muted transition-transform", open && "rotate-90")} />
                  </button>
                  {open ? <DayList records={records.filter((record) => record.userId === user.id)} /> : null}
                </div>
              );
            })}
          </Card>
        ) : null}

        {/* Asesor: su propio detalle */}
        {soloUser ? (
          <Card className="overflow-hidden p-0">
            <DayList records={detail} />
          </Card>
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
