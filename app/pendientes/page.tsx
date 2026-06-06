"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Plus, UserRound } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Card, FloatingActionButton, PremiumButton, priorityTone, statusTone } from "@/components/ui";

type Filter = "todos" | "urgentes" | "hoy";

export default function PendientesPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [session, setSession] = useState<User | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");

  useEffect(() => {
    setSession(getSession());
    fetchAppData().then(setData).catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <>
        <AppHeader title="Pendientes" subtitle="Cargando handover desde PostgreSQL." backHref="/manager" />
        <AppFrame><Card>Conectando...</Card></AppFrame>
        <BottomNav />
      </>
    );
  }

  const managers = data.users.filter((user) => user.role === "GERENTE" || user.role === "SUBGERENTE").map((user) => user.id);
  const management = data.pendings.filter((pending) => managers.includes(pending.ownerId) || pending.priority === "critica");
  const userName = (id: string) => data.users.find((user) => user.id === id)?.name ?? "Equipo";
  const isAdvisor = session?.role === "ASESOR";
  const basePendings = isAdvisor && session ? data.pendings.filter((pending) => pending.ownerId === session.id) : data.pendings;
  const visiblePendings = basePendings.filter((pending) => {
    if (filter === "urgentes") return pending.priority === "critica" || pending.priority === "alta";
    if (filter === "hoy") return pending.dueDate.includes("2026-06-05") || pending.status !== "completado";
    return true;
  });

  return (
    <>
      <AppHeader title="Pendientes" subtitle={isAdvisor ? "Tus pendientes asignados." : "Handover, responsables y fechas limite."} backHref={isAdvisor ? "/advisor" : "/manager"} />
      <AppFrame>
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-2">
          {[
            ["todos", "Todos"],
            ["urgentes", "Urgentes"],
            ["hoy", "Hoy"]
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value as Filter)}
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-black transition ${filter === value ? "bg-volt text-void" : "liquid-glass text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {!isAdvisor ? (
          <Card className="mb-5 border-volt/30 bg-volt/[0.055]">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="text-volt" size={18} />
              <h2 className="text-lg font-black">Pendientes de gerencia</h2>
            </div>
            <div className="space-y-2">
              {management.slice(0, 3).map((pending) => (
                <div key={pending.id} className="liquid-glass rounded-2xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold">{pending.title}</p>
                    <Badge tone={priorityTone(pending.priority)}>{pending.priority}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{pending.description}</p>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {!isAdvisor ? (
          <Card className="mb-5" id="crear-pendiente">
            <h2 className="text-lg font-black">Crear pendiente</h2>
            <div className="mt-4 grid gap-3">
              <input className="min-h-12 rounded-2xl border border-line bg-panel px-3 py-3 outline-none focus:border-volt" placeholder="Titulo" />
              <textarea className="min-h-20 rounded-2xl border border-line bg-panel px-3 py-3 outline-none focus:border-volt" placeholder="Descripcion" />
              <div className="grid grid-cols-2 gap-3">
                <select className="min-h-12 rounded-2xl border border-line bg-panel px-3 py-3 outline-none focus:border-volt">
                  <option>operacion</option><option>equipo</option><option>comercial</option><option>cliente</option><option>inventario</option><option>mantenimiento</option>
                </select>
                <select className="min-h-12 rounded-2xl border border-line bg-panel px-3 py-3 outline-none focus:border-volt">
                  <option>media</option><option>alta</option><option>critica</option><option>baja</option>
                </select>
              </div>
              <PremiumButton type="button" variant="primary" icon={<Plus size={17} />}>Crear pendiente</PremiumButton>
            </div>
          </Card>
        ) : null}

        <div className="space-y-3">
          {visiblePendings.map((pending) => (
            <Card key={pending.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-black">{pending.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">{pending.description}</p>
                </div>
                <Badge tone={priorityTone(pending.priority)}>{pending.priority}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Info label="Categoria" value={pending.category} />
                <Info label="Estado" value={pending.status} tone={statusTone(pending.status)} />
                <Info label="Responsable" value={userName(pending.ownerId)} icon={<UserRound size={14} />} />
                <Info label="Limite" value={pending.dueDate} />
              </div>
            </Card>
          ))}
          {visiblePendings.length === 0 ? (
            <Card>
              <p className="font-black">Sin pendientes</p>
              <p className="mt-2 text-sm text-muted">Cambia el filtro o espera nuevas asignaciones.</p>
            </Card>
          ) : null}
        </div>
      </AppFrame>
      {!isAdvisor ? <FloatingActionButton href="#crear-pendiente" label="Crear" icon={Plus} /> : null}
      <BottomNav />
    </>
  );
}

function Info({ label, value, tone, icon }: { label: string; value: string; tone?: Parameters<typeof Badge>[0]["tone"]; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/[0.045] p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-muted">{label}</p>
      <div className="mt-2 flex items-center gap-1.5 text-sm font-bold text-ink">
        {icon}
        {tone ? <Badge tone={tone}>{value}</Badge> : value}
      </div>
    </div>
  );
}
