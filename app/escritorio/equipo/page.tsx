"use client";

import { CalendarClock, Clock, MapPin, UsersRound } from "lucide-react";
import { completion } from "@/lib/format";
import { achievementTone, Badge, Card, ProgressBar, ProfileAvatar } from "@/components/ui";
import { useDesktopData } from "@/components/desktop/useDesktopData";

const roleLabel: Record<string, string> = { GERENTE: "Gerente", SUBGERENTE: "Subgerente", ASESOR: "Asesor" };
const roleTone = (role: string) => (role === "GERENTE" ? "warn" : role === "SUBGERENTE" ? "info" : "default") as Parameters<typeof Badge>[0]["tone"];

export default function EscritorioEquipo() {
  const { data } = useDesktopData();

  if (!data) {
    return (
      <div className="grid animate-pulse grid-cols-5 gap-5">
        <div className="col-span-3 h-96 rounded-3xl bg-slate-200 dark:bg-slate-800" />
        <div className="col-span-2 h-96 rounded-3xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  const todayKey = data.dashboardDaily.date;
  const order: Record<string, number> = { GERENTE: 0, SUBGERENTE: 1, ASESOR: 2 };
  const members = [...data.users].sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.name.localeCompare(b.name));
  const progressFor = (id: string) => {
    const kpi = data.kpis.find((k) => k.userId === id && k.date === todayKey);
    if (!kpi || (kpi.dailyGoal ?? 0) === 0) return null;
    return completion(kpi.dailySales, kpi.dailyGoal);
  };
  const schedulesByUser = (id: string) => data.schedules.filter((s) => s.userId === id);

  return (
    <div className="grid grid-cols-5 gap-5">
      {/* Equipo */}
      <Card className="col-span-3 h-fit p-5">
        <div className="mb-3 flex items-center gap-2"><UsersRound className="text-volt" size={18} /><h2 className="text-lg font-black text-ink">Equipo ({members.length})</h2></div>
        <div className="overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-panel text-left text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
              <tr>
                <th className="px-4 py-2.5">Colaborador</th>
                <th className="px-4 py-2.5"># Empleado</th>
                <th className="px-4 py-2.5 w-40">Alcance hoy</th>
              </tr>
            </thead>
            <tbody>
              {members.map((u) => {
                const progress = progressFor(u.id);
                return (
                  <tr key={u.id} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <ProfileAvatar name={u.name} photoUrl={u.photoUrl} size="sm" className="size-9 rounded-xl shadow-none" />
                        <div>
                          <p className="font-bold text-ink">{u.name}</p>
                          <Badge tone={roleTone(u.role)}>{roleLabel[u.role] ?? u.role}</Badge>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{u.employeeNumber}</td>
                    <td className="px-4 py-2.5">
                      {u.role !== "ASESOR" ? <span className="text-xs text-muted">—</span> : progress === null ? <Badge>Descanso</Badge> : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1"><ProgressBar value={progress} tone={achievementTone(progress)} /></div>
                          <span className="w-9 shrink-0 text-right text-xs font-black text-ink">{progress}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Horarios */}
      <Card className="col-span-2 h-fit p-5">
        <div className="mb-3 flex items-center gap-2"><CalendarClock className="text-volt" size={18} /><h2 className="text-lg font-black text-ink">Horarios</h2></div>
        <div className="space-y-3">
          {members.map((u) => {
            const shifts = schedulesByUser(u.id);
            if (shifts.length === 0) return null;
            return (
              <div key={u.id} className="rounded-2xl border border-line p-3">
                <div className="mb-2 flex items-center gap-2.5">
                  <ProfileAvatar name={u.name} photoUrl={u.photoUrl} size="sm" className="size-7 rounded-lg shadow-none" />
                  <p className="text-sm font-black text-ink">{u.name}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {shifts.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-[11px] font-bold text-muted ring-1 ring-line">
                      <span className="font-black text-ink">{s.day}</span>
                      <Clock size={11} /> {s.start}–{s.end}
                      {s.zone ? <><MapPin size={11} /> {s.zone}</> : null}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          {data.schedules.length === 0 ? <p className="py-6 text-center text-sm text-muted">Sin horarios registrados.</p> : null}
        </div>
      </Card>
    </div>
  );
}
