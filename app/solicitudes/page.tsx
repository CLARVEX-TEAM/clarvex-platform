"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, Check, Send, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import { SHIFT_TYPE_LABELS, formatRequestDate, isHourType } from "@/lib/shift-requests";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Button, Card, ProfileAvatar } from "@/components/ui";

type ShiftRequest = {
  id: string;
  date: string;
  type: string;
  hours: number | null;
  reason: string | null;
  status: "PENDIENTE" | "APROBADO" | "RECHAZADO";
  managerNote: string | null;
  createdAt: string;
  requester: { name: string; photoUrl?: string | null };
};

function typeLabel(request: { type: string; hours: number | null }) {
  const base = SHIFT_TYPE_LABELS[request.type] ?? request.type;
  return request.hours ? `${base} (${request.hours} h)` : base;
}

const statusTone: Record<string, "warn" | "success" | "danger"> = { PENDIENTE: "warn", APROBADO: "success", RECHAZADO: "danger" };
const statusLabel: Record<string, string> = { PENDIENTE: "Pendiente", APROBADO: "Aprobada", RECHAZADO: "Rechazada" };

export default function SolicitudesPage() {
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [type, setType] = useState("VACACIONES");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const isManager = Boolean(session && session.role !== "ASESOR");

  useEffect(() => {
    getSession().then((current) => { if (!current) router.replace("/login"); else setSession(current); });
  }, [router]);

  useEffect(() => {
    if (!session) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function load() {
    try {
      const data = await fetch("/api/shift-requests", { cache: "no-store" }).then((response) => response.json() as Promise<{ requests?: ShiftRequest[]; balance?: number }>);
      setRequests(data.requests ?? []);
      setBalance(data.balance ?? 0);
    } catch {
      setStatus("No se pudieron cargar las solicitudes.");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!date) { setStatus("Elige una fecha."); return; }
    const hoursValue = Number(hours);
    if (isHourType(type) && (!hoursValue || hoursValue <= 0)) { setStatus("Indica cuántas horas."); return; }
    setSending(true);
    setStatus("");
    try {
      const response = await fetch("/api/shift-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, type, reason: reason.trim() || undefined, ...(isHourType(type) ? { hours: hoursValue } : {}) })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo enviar la solicitud.");
      setStatus("Solicitud enviada. ✅");
      setDate("");
      setReason("");
      setHours("");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo enviar la solicitud.");
    } finally {
      setSending(false);
    }
  }

  async function resolve(id: string, decision: "APROBADO" | "RECHAZADO") {
    setBusyId(id);
    try {
      const response = await fetch(`/api/shift-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: decision })
      });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      setStatus("No se pudo actualizar la solicitud.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = requests.filter((request) => request.status === "PENDIENTE");
  const history = requests.filter((request) => request.status !== "PENDIENTE");

  return (
    <>
      <AppHeader title="Solicitudes" subtitle="Cambio de turno y días libres" backHref={isManager ? "/manager" : "/advisor"} />
      <AppFrame>
        <Card className="mb-3 p-3.5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarOff className="text-volt" size={18} />
              <h2 className="text-lg font-black">Solicitar</h2>
            </div>
            <Badge tone={balance > 0 ? "success" : "default"}>Saldo: {balance} h</Badge>
          </div>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="text-xs font-bold text-muted">Fecha</span>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt" />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-bold text-muted">Tipo</span>
                <select value={type} onChange={(event) => setType(event.target.value)} className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt">
                  <optgroup label="Día completo">
                    <option value="VACACIONES">Vacaciones</option>
                    <option value="DESCANSO">Descanso</option>
                    <option value="PAGO_DIA">Pago de día</option>
                  </optgroup>
                  <optgroup label="Permiso de horas">
                    <option value="SALIR_TEMPRANO">Salir temprano</option>
                    <option value="ENTRAR_TARDE">Entrar tarde</option>
                  </optgroup>
                </select>
              </label>
            </div>
            {isHourType(type) ? (
              <label className="grid gap-1">
                <span className="text-xs font-bold text-muted">Horas (de tu saldo de {balance} h)</span>
                <input type="number" step="0.5" min="0.5" inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} placeholder="Ej. 2" className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt" />
              </label>
            ) : null}
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={280} rows={2} placeholder="Motivo (opcional)…" className="rounded-2xl border border-line bg-panel px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-volt" />
            <Button type="button" variant="primary" icon={<Send size={16} />} onClick={() => void submit()} disabled={sending} className="w-full">{sending ? "Enviando…" : "Enviar solicitud"}</Button>
            {status ? <p className="text-sm font-semibold text-muted">{status}</p> : null}
          </div>
        </Card>

        {isManager && pending.length > 0 ? (
          <Card className="mb-3 p-3.5">
            <h2 className="mb-2.5 text-lg font-black">Pendientes por aprobar</h2>
            <div className="space-y-2.5">
              {pending.map((request) => (
                <div key={request.id} className="rounded-2xl border border-line p-3">
                  <div className="flex items-center gap-2.5">
                    <ProfileAvatar name={request.requester.name} photoUrl={request.requester.photoUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-black text-ink">{request.requester.name}</p>
                      <p className="text-xs text-muted">{typeLabel(request)} · {formatRequestDate(request.date)}</p>
                    </div>
                  </div>
                  {request.reason ? <p className="mt-2 text-sm text-muted">“{request.reason}”</p> : null}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button type="button" variant="primary" icon={<Check size={16} />} onClick={() => void resolve(request.id, "APROBADO")} disabled={busyId === request.id} className="min-h-10">Aprobar</Button>
                    <Button type="button" variant="ghost" icon={<X size={16} />} onClick={() => void resolve(request.id, "RECHAZADO")} disabled={busyId === request.id} className="min-h-10 text-rose-600">Rechazar</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <Card className="p-3.5">
          <h2 className="mb-2.5 text-lg font-black">{isManager ? "Historial" : "Mis solicitudes"}</h2>
          {loading ? (
            <p className="py-4 text-sm font-semibold text-muted">Cargando…</p>
          ) : (isManager ? history : requests).length === 0 ? (
            <p className="py-4 text-sm text-muted">Sin solicitudes todavía.</p>
          ) : (
            <div className="divide-y divide-white/[0.07]">
              {(isManager ? history : requests).map((request) => (
                <div key={request.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink">{isManager ? `${request.requester.name} · ` : ""}{typeLabel(request)}</p>
                    <p className="text-xs text-muted">{formatRequestDate(request.date)}</p>
                    {request.reason ? <p className="mt-0.5 text-xs text-muted">“{request.reason}”</p> : null}
                    {request.managerNote ? <p className="mt-0.5 text-xs text-muted">Nota: {request.managerNote}</p> : null}
                  </div>
                  <Badge tone={statusTone[request.status]}>{statusLabel[request.status]}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </AppFrame>
      <BottomNav />
    </>
  );
}
