"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarHeart, CheckCircle2, Clock3, UsersRound } from "lucide-react";
import { completion } from "@/lib/format";
import { dateKey, startOfWeek } from "@/lib/schedule-week";
import type { Role } from "@/lib/types";
import { achievementTone, Badge, Button, Card, ProgressBar, ProfileAvatar } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useDesktopData } from "@/components/desktop/useDesktopData";
import { DesktopError } from "@/components/desktop/DesktopError";

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
      hoursOwed: String(u.hoursOwed ?? 0), vacationDays: String(u.vacationDays ?? 0), paidDays: String(u.paidDays ?? 0)
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
      <div className="grid animate-pulse grid-cols-5 gap-5">
        <div className="col-span-3 h-96 rounded-3xl bg-slate-200 dark:bg-slate-800" />
        <div className="col-span-2 h-96 rounded-3xl bg-slate-200 dark:bg-slate-800" />
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

  const inputClass = "min-h-10 w-full rounded-xl border border-line bg-panel px-2.5 text-sm font-bold text-ink outline-none focus:border-volt";

  return (
    <div className="space-y-5">
    <div className="grid grid-cols-5 gap-5">
      {/* Equipo */}
      <Card className="col-span-3 h-fit p-5">
        <div className="mb-3 flex items-center gap-2"><UsersRound className="text-volt" size={18} /><h2 className="text-lg font-black text-ink">Equipo ({members.length})</h2></div>
        <div className="overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-panel text-left text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
              <tr>
                <th className="px-4 py-2.5">Colaborador</th>
                <th className="px-4 py-2.5">Hoy</th>
                <th className="px-4 py-2.5 w-36">Alcance hoy</th>
              </tr>
            </thead>
            <tbody>
              {members.map((u) => {
                const progress = progressFor(u.id);
                const status = todayStatus(u.id);
                return (
                  <tr key={u.id} className="border-t border-line transition-colors hover:bg-volt/[0.04] even:bg-slate-50/50 dark:even:bg-white/[0.02]">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <ProfileAvatar name={u.name} photoUrl={u.photoUrl} size="sm" className="size-9 rounded-xl shadow-none" />
                        <div>
                          <p className="font-bold text-ink">{u.name}</p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <Badge tone={roleTone(u.role)}>{roleLabel[u.role] ?? u.role}</Badge>
                            <span className="text-[11px] text-muted">#{u.employeeNumber}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {status ? <Badge tone={statusConfig[status].tone}>{statusConfig[status].label}</Badge> : <span className="text-xs text-muted">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {u.role !== "ASESOR" ? <span className="text-xs text-muted">—</span>
                        : status && status !== "WORKING" ? <span className="text-xs text-muted">{statusConfig[status].label}</span>
                        : progress === null ? <span className="text-xs text-muted">—</span> : (
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

      {/* Horarios de la semana */}
      <Card className="col-span-2 h-fit p-5">
        <div className="mb-3 flex items-center gap-2"><CalendarClock className="text-volt" size={18} /><h2 className="text-lg font-black text-ink">Horarios de la semana</h2></div>
        <div className="space-y-3">
          {members.map((u) => {
            const week = weekFor(u.id);
            if (week.length === 0) return null;
            return (
              <div key={u.id} className="rounded-2xl border border-line p-3">
                <div className="mb-2 flex items-center gap-2.5">
                  <ProfileAvatar name={u.name} photoUrl={u.photoUrl} size="sm" className="size-7 rounded-lg shadow-none" />
                  <p className="text-sm font-black text-ink">{u.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {week.map((s) => {
                    const config = statusConfig[s.status];
                    const isToday = s.date === todayKey;
                    const dow = dayAbbr[new Date(`${s.date}T00:00:00Z`).getUTCDay()];
                    return (
                      <div key={s.id} className={`flex items-center justify-between gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] ${isToday ? "border-volt/40 bg-volt/[0.06]" : "border-line bg-panel"}`}>
                        <span className="font-black text-ink">{dow}</span>
                        {s.status === "WORKING" && s.startTime ? (
                          <span className="flex items-center gap-1 text-muted"><Clock3 size={11} />{s.startTime}{s.endTime ? `–${s.endTime}` : ""}</span>
                        ) : (
                          <Badge tone={config.tone}>{config.label}</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {schedules.length === 0 ? <p className="py-6 text-center text-sm text-muted">Sin horarios para esta semana.</p> : null}
        </div>
      </Card>
    </div>

      {/* Fechas y saldos del equipo (editable) */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><CalendarHeart className="text-volt" size={18} /><h2 className="text-lg font-black text-ink">Fechas y saldos del equipo</h2></div>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-panel text-left text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
              <tr>
                <th className="px-4 py-2.5">Colaborador</th>
                <th className="px-3 py-2.5">Cumpleaños</th>
                <th className="px-3 py-2.5">Ingreso</th>
                <th className="px-3 py-2.5">Horas saldo</th>
                <th className="px-3 py-2.5">Vacaciones</th>
                <th className="px-3 py-2.5">Pago día</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {editRows.map((row) => (
                <tr key={row.id} className="border-t border-line align-middle">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2.5">
                      <ProfileAvatar name={row.name} photoUrl={row.photoUrl} size="sm" className="size-8 rounded-xl shadow-none" />
                      <span className="font-bold text-ink">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2"><input type="date" value={row.birthDate} onChange={(e) => updateRow(row.id, "birthDate", e.target.value)} className={inputClass} /></td>
                  <td className="px-3 py-2"><input type="date" value={row.hireDate} onChange={(e) => updateRow(row.id, "hireDate", e.target.value)} className={inputClass} /></td>
                  <td className="px-3 py-2"><input type="number" step="0.5" inputMode="decimal" value={row.hoursOwed} onChange={(e) => updateRow(row.id, "hoursOwed", e.target.value)} className={`${inputClass} w-20`} /></td>
                  <td className="px-3 py-2"><input type="number" step="1" min="0" inputMode="numeric" value={row.vacationDays} onChange={(e) => updateRow(row.id, "vacationDays", e.target.value)} className={`${inputClass} w-20`} /></td>
                  <td className="px-3 py-2"><input type="number" step="1" min="0" inputMode="numeric" value={row.paidDays} onChange={(e) => updateRow(row.id, "paidDays", e.target.value)} className={`${inputClass} w-20`} /></td>
                  <td className="px-3 py-2">
                    {savedId === row.id ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 size={15} />Guardado</span>
                    ) : (
                      <Button type="button" variant="ghost" onClick={() => void saveRow(row)} disabled={savingId === row.id} className="min-h-9 px-3 text-xs">
                        {savingId === row.id ? "Guardando…" : "Guardar"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
