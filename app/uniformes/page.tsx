"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shirt } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import {
  outfitFor,
  swatchFor,
  WEEKDAY_LABEL,
  type UniformDay,
  type UniformVariant
} from "@/lib/uniforms";
import { AppFrame, AppHeader, Button, Card, ProfileAvatar } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";

type Teammate = { id: string; name: string; photoUrl: string | null; uniformVariant: UniformVariant | null };

/** Hoy en Monterrey, para no equivocarse de día por la zona del servidor. */
function todayWeekday(): number {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${key}T00:00:00.000Z`).getUTCDay();
}

function Swatch({ garment }: { garment: string }) {
  return (
    <span
      className="inline-block size-3 shrink-0 rounded-full ring-1 ring-black/15 dark:ring-white/25"
      style={{ background: swatchFor(garment) }}
      aria-hidden
    />
  );
}

export default function UniformesPage() {
  const router = useRouter();
  const toast = useToast();
  const [session, setSession] = useState<User | null>(null);
  const [days, setDays] = useState<UniformDay[]>([]);
  const [users, setUsers] = useState<Teammate[]>([]);
  const [myVariant, setMyVariant] = useState<UniformVariant | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const today = todayWeekday();

  useEffect(() => {
    getSession().then((current) => {
      if (!current) router.replace("/login");
      else setSession(current);
    });
  }, [router]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/uniforms", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { days: UniformDay[]; users: Teammate[]; canEdit: boolean; myVariant: UniformVariant | null };
      setDays(payload.days);
      setUsers(payload.users);
      setCanEdit(payload.canEdit);
      setMyVariant(payload.myVariant);
    } catch {
      // Sin conexión: se deja lo que había.
    }
  }, []);

  useEffect(() => { if (session) void load(); }, [session, load]);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/uniforms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days,
          variants: users.map((user) => ({ userId: user.id, variant: user.uniformVariant }))
        })
      });
      if (!response.ok) throw new Error();
      toast("Uniformes guardados.", "success");
      setEditing(false);
      await load();
    } catch {
      toast("No se pudo guardar.", "error");
    } finally {
      setSaving(false);
    }
  }

  function editDay(weekday: number, field: keyof UniformDay, value: string) {
    setDays((current) => current.map((day) => day.weekday === weekday ? { ...day, [field]: value } : day));
  }

  const todayDay = days.find((day) => day.weekday === today);
  const mine = todayDay ? outfitFor(todayDay, myVariant) : null;

  return (
    <>
      <AppHeader title="Uniformes" subtitle="Qué toca ponerse cada día." backHref={session?.role === "ASESOR" ? "/advisor" : "/manager"} />
      <AppFrame>
        {/* Lo de HOY, que es lo único que importa al abrir */}
        {mine ? (
          <Card className="mb-3 p-4">
            <p className="text-xs font-bold text-muted">Hoy · {WEEKDAY_LABEL[today]}</p>
            <div className="mt-2 grid gap-1.5">
              <p className="flex items-center gap-2 text-base font-semibold text-ink">
                <Swatch garment={mine.top} /> {mine.top}
              </p>
              <p className="flex items-center gap-2 text-base font-semibold text-ink">
                <Swatch garment={mine.bottom} /> {mine.bottom}
              </p>
            </div>
            {mine.note ? <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">{mine.note}</p> : null}
            {!myVariant ? (
              <p className="mt-2 rounded-xl bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Gerencia aún no te asignó variante de uniforme. Se te muestra la de mujer como referencia.
              </p>
            ) : null}
          </Card>
        ) : null}

        {/* La semana completa */}
        <Card className="mb-3 p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shirt size={17} className="text-volt" />
              <h2 className="text-base font-semibold text-ink">La semana</h2>
            </div>
            {canEdit ? (
              <Button type="button" variant="ghost" onClick={() => setEditing((value) => !value)}>
                {editing ? "Cancelar" : "Editar"}
              </Button>
            ) : null}
          </div>

          <div className="divide-y divide-line/50">
            {days.map((day) => {
              const outfit = outfitFor(day, myVariant);
              const isToday = day.weekday === today;
              return (
                <div key={day.weekday} className={cn("py-2.5", isToday && "rounded-xl bg-volt/[0.07] px-2")}>
                  <p className={cn("text-xs font-semibold", isToday ? "text-volt" : "text-muted")}>
                    {WEEKDAY_LABEL[day.weekday]}{isToday ? " · hoy" : ""}
                  </p>
                  {editing ? (
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      {(["womanTop", "womanBottom", "manTop", "manBottom"] as const).map((field) => (
                        <label key={field} className="grid gap-0.5">
                          <span className="text-[10px] font-bold text-muted">
                            {field === "womanTop" ? "Mujer · arriba" : field === "womanBottom" ? "Mujer · abajo" : field === "manTop" ? "Hombre · arriba" : "Hombre · abajo"}
                          </span>
                          <input
                            value={day[field]}
                            onChange={(event) => editDay(day.weekday, field, event.target.value)}
                            maxLength={80}
                            className="min-h-9 rounded-xl border border-line bg-panel px-2 text-xs font-bold text-ink outline-none focus:border-volt"
                          />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-ink">
                      <Swatch garment={outfit.top} /> {outfit.top}
                      <span className="text-muted">·</span>
                      <Swatch garment={outfit.bottom} /> {outfit.bottom}
                    </p>
                  )}
                  {day.note && !editing ? <p className="mt-0.5 text-[11px] font-semibold text-muted">{day.note}</p> : null}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Quién usa qué variante (solo gerencia) */}
        {canEdit && editing ? (
          <Card className="mb-3 p-3.5">
            <h2 className="mb-1 text-base font-semibold text-ink">Variante por colaborador</h2>
            <p className="mb-3 text-[11px] font-semibold text-muted">
              Decide qué columna del uniforme le toca a cada quien. No registra identidad: solo qué playera usa.
            </p>
            <div className="divide-y divide-line/50">
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-3 py-2">
                  <ProfileAvatar name={user.name} photoUrl={user.photoUrl} size="sm" />
                  <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{user.name}</p>
                  <div className="flex shrink-0 gap-1">
                    {(["MUJER", "HOMBRE"] as const).map((variant) => (
                      <button
                        key={variant}
                        type="button"
                        onClick={() => setUsers((current) => current.map((row) => row.id === user.id ? { ...row, uniformVariant: row.uniformVariant === variant ? null : variant } : row))}
                        className={cn(
                          "rounded-xl px-2.5 py-1 text-[11px] font-semibold transition",
                          user.uniformVariant === variant ? "bg-volt text-white" : "bg-slate-100 text-muted dark:bg-slate-800"
                        )}
                      >
                        {variant === "MUJER" ? "Mujer" : "Hombre"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {editing ? (
          <Button type="button" variant="primary" className="w-full" onClick={() => void save()} disabled={saving}>
            {saving ? "Guardando…" : "Guardar uniformes"}
          </Button>
        ) : null}
      </AppFrame>
    </>
  );
}
