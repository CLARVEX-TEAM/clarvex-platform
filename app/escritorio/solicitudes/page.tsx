"use client";

import { useEffect, useState } from "react";
import { CalendarOff, Check, Send, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import { DAY_BALANCE_LABELS, SHIFT_TYPE_LABELS, dayBalanceField, formatRequestDate, isHourType } from "@/lib/shift-requests";
import type { User } from "@/lib/types";
import { Badge, ProfileAvatar } from "@/components/ui";
import { useToast } from "@/components/Toast";
import {
  DeskButton, DeskEmpty, DeskPanel, DeskPrimaryButton, DeskReveal, DeskSection, DeskSkeleton, deskInput
} from "@/components/desktop/DeskUI";
import { ShineBorder } from "@/components/magic/ShineBorder";

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

export default function EscritorioSolicitudes() {
  const toast = useToast();
  const [session, setSession] = useState<User | null>(null);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [balance, setBalance] = useState(0);
  const [vacationDays, setVacationDays] = useState(0);
  const [paidDays, setPaidDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [type, setType] = useState("VACACIONES");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isManager = Boolean(session && session.role !== "ASESOR");

  useEffect(() => {
    getSession().then((current) => { if (current) setSession(current); });
  }, []);

  useEffect(() => {
    if (!session) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function load() {
    try {
      const data = await fetch("/api/shift-requests", { cache: "no-store" }).then((response) => response.json() as Promise<{ requests?: ShiftRequest[]; balance?: number; vacationDays?: number; paidDays?: number }>);
      setRequests(data.requests ?? []);
      setBalance(data.balance ?? 0);
      setVacationDays(data.vacationDays ?? 0);
      setPaidDays(data.paidDays ?? 0);
    } catch {
      toast("No se pudieron cargar las solicitudes.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!date) { toast("Elige una fecha.", "error"); return; }
    const hoursValue = Number(hours);
    if (isHourType(type)) {
      if (!hoursValue || hoursValue <= 0) { toast("Indica cuántas horas.", "error"); return; }
      if (balance <= 0) { toast("No tienes saldo de horas disponible.", "error"); return; }
      if (hoursValue > balance) { toast(`Máximo ${balance} h disponibles.`, "error"); return; }
    }
    const dayField = dayBalanceField(type);
    if (dayField) {
      const dayBalance = dayField === "vacationDays" ? vacationDays : paidDays;
      if (dayBalance < 1) { toast(`No tienes saldo de ${DAY_BALANCE_LABELS[dayField]} disponible.`, "error"); return; }
    }
    setSending(true);
    try {
      const response = await fetch("/api/shift-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, type, reason: reason.trim() || undefined, ...(isHourType(type) ? { hours: hoursValue } : {}) })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo enviar la solicitud.");
      toast("Solicitud enviada.", "success");
      setDate("");
      setReason("");
      setHours("");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo enviar la solicitud.", "error");
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
      toast("No se pudo actualizar la solicitud.", "error");
    } finally {
      setBusyId(null);
    }
  }

  const pending = requests.filter((request) => request.status === "PENDIENTE");
  const history = requests.filter((request) => request.status !== "PENDIENTE");

  const dayField = dayBalanceField(type);
  const dayBalance = dayField === "vacationDays" ? vacationDays : dayField === "paidDays" ? paidDays : 0;
  const dayBlocked = dayField !== null && dayBalance < 1;
  const hourBlocked = isHourType(type) && (balance <= 0 || (Number(hours) || 0) > balance);

  return (
    <div className="grid gap-10 xl:grid-cols-[22rem_minmax(0,1fr)]">
      {/* Formulario */}
      <DeskReveal index={0}>
        <div className="xl:sticky xl:top-20">
          <DeskSection title="Solicitar">
            <DeskPanel>
              <div className="mb-4 flex flex-wrap gap-1.5">
                <Badge tone={balance > 0 ? "success" : "default"}>Horas: {balance} h</Badge>
                <Badge tone={vacationDays > 0 ? "success" : "default"}>Vacaciones: {vacationDays} d</Badge>
                <Badge tone={paidDays > 0 ? "success" : "default"}>Pago de día: {paidDays} d</Badge>
              </div>

              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1">
                    <span className="text-caption font-medium text-muted">Fecha</span>
                    <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={deskInput} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-caption font-medium text-muted">Tipo</span>
                    <select value={type} onChange={(event) => setType(event.target.value)} className={deskInput}>
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
                    <span className="text-caption font-medium text-muted">Horas (de tu saldo de {balance} h)</span>
                    <input
                      type="number" step="0.5" min="0.5" inputMode="decimal"
                      value={hours} onChange={(event) => setHours(event.target.value)}
                      placeholder="2" className={deskInput}
                      aria-describedby={balance <= 0 || (Number(hours) || 0) > balance ? "aviso-horas" : undefined}
                    />
                    {balance <= 0 ? (
                      <span id="aviso-horas" className="text-caption font-medium text-danger">No tienes saldo de horas.</span>
                    ) : (Number(hours) || 0) > balance ? (
                      <span id="aviso-horas" className="text-caption font-medium text-danger">Máximo {balance} h disponibles.</span>
                    ) : null}
                  </label>
                ) : null}

                {dayBlocked ? (
                  <p className="text-caption font-medium text-danger">
                    No tienes saldo de {DAY_BALANCE_LABELS[dayField!]} disponible.
                  </p>
                ) : null}

                <label className="grid gap-1">
                  <span className="text-caption font-medium text-muted">Motivo (opcional)</span>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={280}
                    rows={2}
                    placeholder="Cita médica, trámite…"
                    className={`${deskInput} py-2.5`}
                  />
                </label>

                <DeskPrimaryButton
                  type="button"
                  onClick={() => void submit()}
                  disabled={sending || hourBlocked || dayBlocked}
                  className="w-full"
                >
                  <Send size={15} /> {sending ? "Enviando…" : "Enviar solicitud"}
                </DeskPrimaryButton>
              </div>
            </DeskPanel>
          </DeskSection>
        </div>
      </DeskReveal>

      {/* Listas */}
      <DeskReveal index={1}>
        <div className="space-y-8">
          {isManager && pending.length > 0 ? (
            <DeskSection title={`Pendientes por aprobar · ${pending.length}`}>
              {/* Sin atender y bloqueando a alguien del equipo: es el caso
                  exacto de ShineBorder. */}
              <ShineBorder radius="rounded-[18px]" ringPx={1.5} tone="ember">
                <div className="rounded-2xl border border-line bg-card p-5">
                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {pending.map((request) => (
                      <article key={request.id} className="rounded-xl border border-line bg-panel p-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <ProfileAvatar name={request.requester.name} photoUrl={request.requester.photoUrl} size="sm" className="size-8 shrink-0 rounded-lg text-[10px] shadow-none" />
                          <div className="min-w-0">
                            <p className="truncate text-ui font-medium text-ink">{request.requester.name}</p>
                            <p className="truncate text-caption text-muted">{typeLabel(request)} · {formatRequestDate(request.date)}</p>
                          </div>
                        </div>
                        {request.reason ? <p className="mt-2 text-caption text-muted">“{request.reason}”</p> : null}
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <DeskButton
                            type="button"
                            onClick={() => void resolve(request.id, "APROBADO")}
                            disabled={busyId === request.id}
                            className="border-ok/40 text-ok hover:border-ok"
                          >
                            <Check size={15} /> Aprobar
                          </DeskButton>
                          <DeskButton
                            type="button"
                            onClick={() => void resolve(request.id, "RECHAZADO")}
                            disabled={busyId === request.id}
                            className="text-danger hover:border-danger/50"
                          >
                            <X size={15} /> Rechazar
                          </DeskButton>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </ShineBorder>
            </DeskSection>
          ) : null}

          <DeskSection title={isManager ? "Historial" : "Mis solicitudes"}>
            {loading ? (
              <div className="space-y-2.5">{[0, 1, 2].map((i) => <DeskSkeleton key={i} className="h-12" />)}</div>
            ) : (isManager ? history : requests).length === 0 ? (
              <DeskEmpty
                icon={CalendarOff}
                title="Sin solicitudes todavía"
                hint={isManager
                  ? "Cuando el equipo pida días o permisos, aparecerán aquí para aprobar o rechazar."
                  : "Usa el formulario de la izquierda para pedir vacaciones, descanso o permisos de horas."}
              />
            ) : (
              <ul className="max-w-4xl">
                {(isManager ? history : requests).map((request) => (
                  <li key={request.id} className="flex items-start justify-between gap-3 border-b border-line py-3 last:border-b-0">
                    <div className="min-w-0">
                      <p className="text-ui text-ink">
                        {isManager ? `${request.requester.name} · ` : ""}{typeLabel(request)}
                      </p>
                      <p className="text-caption text-muted">{formatRequestDate(request.date)}</p>
                      {request.reason ? <p className="mt-0.5 text-caption text-muted">“{request.reason}”</p> : null}
                      {request.managerNote ? <p className="mt-0.5 text-caption text-muted">Nota: {request.managerNote}</p> : null}
                    </div>
                    <Badge tone={statusTone[request.status]}>{statusLabel[request.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </DeskSection>
        </div>
      </DeskReveal>
    </div>
  );
}
