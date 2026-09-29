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
import { ShineBorder } from "@/components/externos/shine-border";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";

type Teammate = { id: string; name: string; photoUrl: string | null; uniformVariant: UniformVariant | null };

/** Hoy en Monterrey, para no equivocarse de día por la zona del servidor. */
function todayWeekday(): number {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${key}T00:00:00.000Z`).getUTCDay();
}

/**
 * El color de la prenda.
 *
 * ⚠️ `claro` es para cuando va sobre el degradado del bloque principal: ahí el
 * aro oscuro de siempre desaparece, y una prenda azul marino sobre fondo azul
 * marino se queda sin borde y parece un agujero.
 */
function Swatch({ garment, claro = false }: { garment: string; claro?: boolean }) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full",
        claro ? "size-4 ring-2 ring-white/60" : "size-3 ring-1 ring-black/15 dark:ring-white/25"
      )}
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
        {/*
          ⚠️ Lo de HOY es la pantalla, no una tarjeta más.

          Esta pantalla existe para contestar «¿qué me pongo hoy?», y quien la
          abre lo hace mientras se viste. Antes era una tarjeta con el mismo
          peso que la lista de la semana y que el panel de variantes: había que
          leer tres bloques para encontrar el que contestaba la pregunta.

          El degradado y la marca de agua son los mismos que ya usan Conteos,
          Checklist y Mi día -- salen de `.papel-hero`, así que si cambia el
          logo cambia esto.
        */}
        {mine ? (
          <>
            {/* ⚠️ Solo la APK pinta el bloque de degradado; fuera de ella va la tarjeta de antes. */}
            <div className="solo-papel">
              <section className="papel-hero papel-elev-alta relative mb-3 overflow-hidden rounded-[26px]">
                <svg
                  aria-hidden
                  viewBox="0 0 512 512"
                  className="pointer-events-none absolute -right-10 -top-12 size-56 opacity-[0.07]"
                >
                  <path fill="#FFFFFF" d="M108 171 256 86 403 171 210 283v-57l93-53-47-27-95 55v111l95 56 48-28v-57l99 58-147 85-148-84V171Z" />
                </svg>
                <ShineBorder borderWidth={2} duration={13} shineColor={["#FFFFFF", "#8BB8FF", "#FFFFFF"]} />
                <div className="relative px-6 pb-6 pt-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.09em] opacity-80">
                    Hoy · {WEEKDAY_LABEL[today]}
                  </p>
                  <div className="mt-3 grid gap-2">
                    <p className="flex items-center gap-2.5 text-[21px] font-semibold leading-tight tracking-[-0.02em]">
                      <Swatch garment={mine.top} claro /> {mine.top}
                    </p>
                    <p className="flex items-center gap-2.5 text-[21px] font-semibold leading-tight tracking-[-0.02em]">
                      <Swatch garment={mine.bottom} claro /> {mine.bottom}
                    </p>
                  </div>
                  {mine.note ? <p className="mt-3 text-[13px] opacity-90">{mine.note}</p> : null}
                  {/*
                    ⚠️ El aviso de variante sin asignar se queda DENTRO del bloque,
                    pegado a la ropa que está enseñando: dice que lo de arriba puede
                    no ser lo tuyo. Suelto en la pantalla no se sabría a qué se
                    refiere.
                  */}
                  {!myVariant ? (
                    <p className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-[12px] leading-relaxed">
                      Gerencia aún no te asignó variante de uniforme. Arriba va la de
                      mujer, solo como referencia.
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
            <div className="fuera-de-papel">
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
            </div>
          </>
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
                /*
                  ⚠️ En la APK hoy se marca sin fondo de color: el bloque de
                  arriba ya lo dice en grande, y dos cosas gritando «hoy» en la
                  misma pantalla se restan la una a la otra. Fuera de la APK se
                  conserva el fondo de antes del rediseño.
                */
                <div key={day.weekday} className={cn("py-2.5", isToday && "rounded-xl bg-volt/[0.07] px-2 in-data-[surface=papel]:rounded-none in-data-[surface=papel]:bg-transparent in-data-[surface=papel]:px-0")}>
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
                            className="min-h-9 rounded-xl border border-line bg-panel px-2 text-xs font-bold text-ink outline-hidden focus:border-volt"
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
                          user.uniformVariant === variant ? "bg-volt text-white" : "bg-panel text-muted"
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
