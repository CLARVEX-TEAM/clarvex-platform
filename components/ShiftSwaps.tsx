"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Check, X } from "lucide-react";
import { fetchAppData } from "@/lib/app-data";
import { Button, Card, ProfileAvatar } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { SWAP_STATUS_LABEL, SWAP_STATUS_TONE, type SwapStatus } from "@/lib/shift-swap";
import { cn } from "@/lib/utils";

type Swap = {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterPhoto: string | null;
  requesterDate: string;
  targetId: string;
  targetName: string;
  targetPhoto: string | null;
  targetDate: string;
  reason: string | null;
  status: SwapStatus;
  driveUpdated: boolean;
  managerNote: string | null;
};

type Teammate = { id: string; name: string; photoUrl: string | null };

function dayLabel(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return parsed.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Intercambio de descansos entre compañeros.
 *
 * La app COORDINA: propone → el compañero acepta → gerencia autoriza. NO escribe
 * el horario; el archivo de Horarios sigue mandando. Al aprobarse se le dice a
 * gerencia qué cambiar en el Drive, y la app detecta sola cuándo ya quedó.
 */
export function ShiftSwaps({ myId }: { myId: string }) {
  const toast = useToast();
  const [team, setTeam] = useState<Teammate[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [myDate, setMyDate] = useState("");
  const [theirDate, setTheirDate] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/shift-swaps", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { swaps: Swap[]; canApprove: boolean };
      setSwaps(payload.swaps);
      setCanApprove(payload.canApprove);
    } catch {
      // Sin conexión: se deja lo que había.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetchAppData()
      .then((data) => setTeam(data.users.map((user) => ({ id: user.id, name: user.name, photoUrl: user.photoUrl ?? null }))))
      .catch(() => undefined);
  }, []);

  async function propose() {
    if (!targetId || !myDate || !theirDate) {
      toast("Elige compañero y las dos fechas.", "error");
      return;
    }
    setBusy("new");
    try {
      const response = await fetch("/api/shift-swaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, requesterDate: myDate, targetDate: theirDate, reason: reason.trim() || undefined })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo enviar.");
      toast("Propuesta enviada a tu compañero.", "success");
      setOpen(false);
      setTargetId(""); setMyDate(""); setTheirDate(""); setReason("");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo enviar.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function act(id: string, action: "ACEPTAR" | "RECHAZAR" | "APROBAR" | "NO_AUTORIZAR") {
    setBusy(id);
    try {
      const response = await fetch(`/api/shift-swaps/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const payload = await response.json() as { error?: string; driveInstructions?: string[] };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo procesar.");
      if (payload.driveInstructions?.length) {
        toast("Autorizado. Ahora actualiza el Drive (ver instrucciones).", "success");
      } else {
        toast("Listo.", "success");
      }
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo procesar.", "error");
    } finally {
      setBusy(null);
    }
  }

  const others = team.filter((mate) => mate.id !== myId);

  return (
    <Card className="mt-3 p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowLeftRight size={17} className="text-volt" />
          <h2 className="text-base font-semibold text-ink">Cambio de descanso</h2>
        </div>
        {others.length > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setOpen((value) => !value)}>
            {open ? "Cancelar" : "Proponer"}
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 grid gap-2 rounded-2xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
          <label className="grid gap-1">
            <span className="text-xs font-bold text-muted">Con quién</span>
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt">
              <option value="">Elige un compañero…</option>
              {others.map((mate) => <option key={mate.id} value={mate.id}>{mate.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-bold text-muted">Mi descanso que cedo</span>
            <input type="date" value={myDate} onChange={(event) => setMyDate(event.target.value)} className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-bold text-muted">Su descanso que pido</span>
            <input type="date" value={theirDate} onChange={(event) => setTheirDate(event.target.value)} className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-bold text-muted">Motivo (opcional)</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-semibold text-ink outline-none focus:border-volt" />
          </label>
          <Button type="button" variant="primary" onClick={() => void propose()} disabled={busy === "new"}>
            {busy === "new" ? "Enviando…" : "Enviar propuesta"}
          </Button>
          <p className="text-[11px] font-semibold text-muted">
            Tu compañero tiene que aceptar, y luego gerencia autorizar.
          </p>
        </div>
      ) : null}

      {swaps.length === 0 ? (
        <p className="mt-3 text-xs font-semibold text-muted">Sin cambios de descanso.</p>
      ) : (
        <div className="mt-3 divide-y divide-line/50">
          {swaps.map((swap) => {
            const mineToAnswer = swap.status === "PENDIENTE_COMPANERO" && swap.targetId === myId;
            const toApprove = canApprove && swap.status === "PENDIENTE_GERENCIA";
            return (
              <div key={swap.id} className="py-2.5">
                <div className="flex items-center gap-2">
                  <ProfileAvatar name={swap.requesterName} photoUrl={swap.requesterPhoto} size="sm" />
                  <ArrowLeftRight size={14} className="shrink-0 text-muted" />
                  <ProfileAvatar name={swap.targetName} photoUrl={swap.targetPhoto} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-ink">
                      {swap.requesterName.split(" ")[0]} ({dayLabel(swap.requesterDate)}) ↔ {swap.targetName.split(" ")[0]} ({dayLabel(swap.targetDate)})
                    </p>
                    {swap.reason ? <p className="truncate text-[11px] text-muted">{swap.reason}</p> : null}
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", SWAP_STATUS_TONE[swap.status])}>
                    {SWAP_STATUS_LABEL[swap.status]}
                  </span>
                </div>

                {/* Aprobado pero el Drive aún no lo refleja: se desmarca solo al sincronizar. */}
                {swap.status === "APROBADO" && !swap.driveUpdated && canApprove ? (
                  <p className="mt-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    ⚠️ Falta actualizarlo en el Drive de Horarios. Se marca solo al sincronizar.
                  </p>
                ) : null}

                {mineToAnswer || toApprove ? (
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      className="flex-1"
                      disabled={busy === swap.id}
                      onClick={() => void act(swap.id, mineToAnswer ? "ACEPTAR" : "APROBAR")}
                    >
                      <Check size={14} /> {mineToAnswer ? "Aceptar" : "Autorizar"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex-1"
                      disabled={busy === swap.id}
                      onClick={() => void act(swap.id, mineToAnswer ? "RECHAZAR" : "NO_AUTORIZAR")}
                    >
                      <X size={14} /> Rechazar
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
