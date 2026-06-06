"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock, MapPin, UsersRound } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Card, StatCard } from "@/components/ui";

export default function HorariosPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [session, setSession] = useState<User | null>(null);

  useEffect(() => {
    getSession().then(setSession);
    fetchAppData().then(setData).catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <>
        <AppHeader title="Horarios" subtitle="Cargando semana desde PostgreSQL." backHref="/manager" />
        <AppFrame><Card>Conectando...</Card></AppFrame>
        <BottomNav />
      </>
    );
  }

  const isAdvisor = session?.role === "ASESOR";
  const advisors = data.users.filter((user) => user.role === "ASESOR");
  const visibleAdvisors = isAdvisor && session ? advisors.filter((advisor) => advisor.id === session.id) : advisors;
  const visibleShifts = data.schedules.filter((shift) => visibleAdvisors.some((advisor) => advisor.id === shift.userId));
  const activeShifts = visibleShifts.filter((shift) => shift.end);
  const restShifts = visibleShifts.length - activeShifts.length;

  return (
    <>
      <AppHeader
        title="Horarios"
        subtitle={isAdvisor ? "Tu semana asignada." : "Semana demo, lista para futura importacion desde Excel."}
        backHref={isAdvisor ? "/advisor" : "/manager"}
      />
      <AppFrame>
        <Card className="mb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink/45">Semana retail</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-ink">{activeShifts.length} turnos</h2>
              <p className="mt-1 text-sm text-ink/58">{visibleAdvisors.length} asesor{visibleAdvisors.length === 1 ? "" : "es"} en vista</p>
            </div>
            <div className="grid size-16 place-items-center rounded-[1.35rem] border border-mint/25 bg-mint/10 text-mint">
              <CalendarDays size={25} />
            </div>
          </div>
        </Card>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <StatCard label="Equipo" value={String(visibleAdvisors.length)} detail="Personas" tone="mint" />
          <StatCard label="Descansos" value={String(restShifts)} detail="Semana" tone="ember" />
        </div>

        <div className="space-y-4">
          {visibleAdvisors.map((advisor) => {
            const shifts = data.schedules.filter((shift) => shift.userId === advisor.id);
            const assigned = shifts.filter((shift) => shift.end).length;
            return (
              <Card key={advisor.id}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-2xl bg-volt/12 text-sm font-black text-volt">{advisor.avatar}</span>
                    <div>
                      <h2 className="text-xl font-black">{advisor.name}</h2>
                      <p className="text-sm text-ink/48">{assigned} turnos asignados</p>
                    </div>
                  </div>
                  <Badge>semanal</Badge>
                </div>
                <div className="grid gap-2">
                  {shifts.map((shift) => (
                    <div key={shift.id} className="liquid-glass grid grid-cols-[48px_1fr_auto] items-center gap-3 rounded-2xl p-3">
                      <p className="font-black text-volt">{shift.day}</p>
                      <div>
                        <p className="flex items-center gap-2 font-bold">
                          <Clock size={15} className="text-ink/40" />
                          {shift.start}{shift.end ? ` - ${shift.end}` : ""}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-sm text-ink/50">
                          <MapPin size={14} />
                          {shift.zone || "Sin asignacion"}
                        </p>
                      </div>
                      <UsersRound size={17} className="text-ink/30" />
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </AppFrame>
      <BottomNav />
    </>
  );
}
