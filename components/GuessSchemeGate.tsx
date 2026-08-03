"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import { GUESS_BRACKETS, GUESS_ROLES } from "@/lib/guess-scheme";
import type { Role } from "@/lib/types";

/**
 * Captura del tabulador de comisiones nuevo de GUESS.
 *
 * Aparece al entrar, a gerencia de una tienda GUESS que todavía no lo tiene
 * capturado. Se puede posponer: son 30 valores y nadie los lleva encima
 * siempre. Mientras no se capture sigue vigente el esquema anterior, así que
 * posponer no rompe nada — solo retrasa el cambio.
 *
 * Al posponer queda un aviso fijo arriba durante la sesión, y la pantalla
 * vuelve a salir en el siguiente ingreso (por eso el "ahora no" vive en
 * sessionStorage y no en localStorage: no debe sobrevivir al cierre de sesión).
 *
 * Se captura un puesto a la vez. En una sola lista, treinta campos en un
 * teléfono son un muro; por puesto son diez y caben en pantalla.
 */

const POSTPONE_KEY = "clarvex-guess-scheme-postponed";
const EXCLUDED = ["/login", "/recuperar", "/reset", "/suspendida", "/manual"];

type Values = Record<string, string>;

const key = (role: Role, min: number, season: "reg" | "alta") => `${role}.${min}.${season}`;

export function GuessSchemeGate() {
  const pathname = usePathname();
  const [needed, setNeeded] = useState(false);
  const [postponed, setPostponed] = useState(false);
  const [open, setOpen] = useState(false);
  const [roleIndex, setRoleIndex] = useState(0);
  const [tier, setTier] = useState("");
  const [values, setValues] = useState<Values>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const excluded = !pathname || EXCLUDED.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  useEffect(() => {
    if (excluded) return;
    let cancelled = false;
    void (async () => {
      const session = await getSession().catch(() => null);
      if (!session || cancelled) return;
      // El modo demo no captura tabuladores: su sesión es de solo lectura y
      // además no representa a una tienda real.
      if ((session as { demo?: boolean }).demo) return;
      if (session.role !== "GERENTE" && session.role !== "SUBGERENTE") return;
      try {
        const res = await fetch("/api/commission-scheme", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { needsCapture?: boolean; tier?: string | null };
        if (cancelled || !data.needsCapture) return;
        setNeeded(true);
        setTier(data.tier ?? "");
        const alreadyPostponed = sessionStorage.getItem(POSTPONE_KEY) === "1";
        setPostponed(alreadyPostponed);
        setOpen(!alreadyPostponed);
      } catch {
        // Sin red no se insiste: volverá a intentarlo en el siguiente ingreso.
      }
    })();
    return () => { cancelled = true; };
  }, [pathname, excluded]);

  // Con la pantalla abierta se bloquea el scroll del fondo, igual que hace la
  // compuerta de términos.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const current = GUESS_ROLES[roleIndex];

  const missing = useMemo(() => {
    let n = 0;
    for (const { role } of GUESS_ROLES) {
      for (const b of GUESS_BRACKETS) {
        if (!values[key(role, b.minAchievement, "reg")]?.trim()) n++;
        if (b.kind === "FIXED" && !values[key(role, b.minAchievement, "alta")]?.trim()) n++;
      }
    }
    return n;
  }, [values]);

  const postpone = useCallback(() => {
    sessionStorage.setItem(POSTPONE_KEY, "1");
    setPostponed(true);
    setOpen(false);
  }, []);

  async function save() {
    setError("");
    setSaving(true);
    try {
      const rows = GUESS_ROLES.map(({ role }) => ({
        role,
        brackets: GUESS_BRACKETS.map((b) => ({
          minAchievement: b.minAchievement,
          regular: Number(values[key(role, b.minAchievement, "reg")] ?? ""),
          high: b.kind === "FIXED" ? Number(values[key(role, b.minAchievement, "alta")] ?? "") : null
        }))
      }));
      const res = await fetch("/api/commission-scheme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tier.trim() || null, rows })
      });
      const payload = await res.json() as { error?: string; issues?: Array<{ message: string }> };
      if (!res.ok) throw new Error(payload.issues?.[0]?.message ?? payload.error ?? "No se pudo guardar.");
      setNeeded(false);
      setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (!needed || excluded) return null;

  return (
    <>
      {postponed && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="desk-adopt fixed inset-x-0 top-0 z-[70] flex min-h-11 w-full items-center justify-center gap-2 bg-ember px-4 text-[13px] font-bold text-white"
        >
          <AlertTriangle size={15} />
          Falta capturar el tabulador de comisiones nuevo
        </button>
      ) : null}

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="desk-adopt fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guess-scheme-title"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-card sm:rounded-3xl"
            >
              <header className="flex items-start justify-between gap-3 border-b border-line px-5 pb-3 pt-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-volt">Esquema nuevo</p>
                  <h2 id="guess-scheme-title" className="mt-0.5 text-lg font-semibold text-ink">
                    Captura el tabulador de comisiones
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={postpone}
                  aria-label="Ahora no"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-panel text-muted"
                >
                  <X size={16} />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <p className="text-[13px] leading-5 text-muted">
                  GUESS cambió el esquema. De <strong className="text-ink">80 % a 99.99 %</strong> se paga un{" "}
                  <strong className="text-ink">importe fijo</strong> por escalón —distinto en temporada regular y
                  alta— y del <strong className="text-ink">100 %</strong> en adelante un porcentaje sobre la venta.
                  Por debajo del 80 % no se paga comisión.
                </p>
                <p className="mt-2 text-[13px] leading-5 text-muted">
                  Los importes cambian según la <strong className="text-ink">etiqueta</strong> de cada tienda, así que
                  hay que capturar los de la tuya. El alcance se mide contra el <strong className="text-ink">mínimo</strong>,
                  como hasta ahora.
                </p>

                <label className="mt-4 block">
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Etiqueta de tu tienda (opcional)</span>
                  <input
                    value={tier}
                    onChange={(e) => setTier(e.target.value)}
                    placeholder="E"
                    maxLength={20}
                    className="mt-1 min-h-11 w-28 rounded-xl border border-line bg-panel px-3 text-sm font-semibold uppercase text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/15"
                  />
                </label>

                {/* Selector de puesto */}
                <div className="mt-5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={roleIndex === 0}
                    onClick={() => setRoleIndex((i) => Math.max(0, i - 1))}
                    aria-label="Puesto anterior"
                    className="grid size-9 place-items-center rounded-full bg-panel text-muted disabled:opacity-35"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="text-center">
                    <p className="text-base font-semibold text-ink">{current.label}</p>
                    <p className="text-[11px] font-semibold text-muted">Puesto {roleIndex + 1} de {GUESS_ROLES.length}</p>
                  </div>
                  <button
                    type="button"
                    disabled={roleIndex === GUESS_ROLES.length - 1}
                    onClick={() => setRoleIndex((i) => Math.min(GUESS_ROLES.length - 1, i + 1))}
                    aria-label="Puesto siguiente"
                    className="grid size-9 place-items-center rounded-full bg-panel text-muted disabled:opacity-35"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                    <span className="flex-1">Escalón</span>
                    <span className="w-[5.5rem] text-center">Regular</span>
                    <span className="w-[5.5rem] text-center">Alta</span>
                  </div>
                  {GUESS_BRACKETS.map((bracket) => (
                    <div key={bracket.minAchievement} className="flex items-center gap-2 rounded-xl bg-panel p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-ink">{bracket.label}</p>
                        <p className="text-[10px] font-semibold text-muted">
                          {bracket.kind === "FIXED" ? "Importe fijo en pesos" : "Porcentaje sobre la venta"}
                        </p>
                      </div>
                      <input
                        inputMode="decimal"
                        value={values[key(current.role, bracket.minAchievement, "reg")] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [key(current.role, bracket.minAchievement, "reg")]: e.target.value.replace(/[^\d.]/g, "") }))}
                        aria-label={`${current.label}, ${bracket.label}, ${bracket.kind === "FIXED" ? "temporada regular" : "porcentaje"}`}
                        placeholder={bracket.kind === "FIXED" ? "$" : "%"}
                        className="min-h-11 w-[5.5rem] rounded-lg border border-line bg-card px-2 text-center text-sm font-semibold text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/15"
                      />
                      {bracket.kind === "FIXED" ? (
                        <input
                          inputMode="decimal"
                          value={values[key(current.role, bracket.minAchievement, "alta")] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [key(current.role, bracket.minAchievement, "alta")]: e.target.value.replace(/[^\d.]/g, "") }))}
                          aria-label={`${current.label}, ${bracket.label}, temporada alta`}
                          placeholder="$"
                          className="min-h-11 w-[5.5rem] rounded-lg border border-line bg-card px-2 text-center text-sm font-semibold text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/15"
                        />
                      ) : (
                        // El porcentaje no cambia entre temporadas: se marca en
                        // vez de dejar un hueco que parezca un campo olvidado.
                        <span className="grid h-11 w-[5.5rem] place-items-center rounded-lg text-[11px] font-semibold text-muted">igual</span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-ember/30 bg-ember/10 p-3">
                  <p className="text-[12px] leading-5 text-ink">
                    <strong>Los meses de temporada alta todavía no están cargados.</strong> Hasta que se carguen, todo
                    se paga con el importe de temporada regular. Captura igualmente las dos columnas.
                  </p>
                </div>

                {error ? <p className="mt-3 text-[13px] font-semibold text-orchid">{error}</p> : null}
              </div>

              <footer className="border-t border-line px-5 pb-5 pt-3">
                <p className="mb-2 text-center text-[11px] font-semibold text-muted">
                  {missing === 0 ? "Todo capturado" : `Faltan ${missing} de 30 valores`}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={postpone}
                    className="min-h-12 flex-1 rounded-full bg-panel text-sm font-semibold text-muted"
                  >
                    Ahora no
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || missing > 0}
                    className="inline-flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-full bg-volt text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {saving ? "Guardando…" : <><Check size={16} /> Guardar y activar</>}
                  </button>
                </div>
                <p className="mt-2 text-center text-[11px] leading-4 text-muted">
                  Al guardar, el esquema entra en vigor de inmediato y sustituye al anterior.
                </p>
              </footer>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
