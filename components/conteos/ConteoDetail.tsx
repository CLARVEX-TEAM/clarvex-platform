"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Download, Lock, LockOpen, Plus, ScanLine, Trash2, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { entryCountsDone, entryNeedsRecount, entryReal, entryResolved, parseTagQr, slotFilled, zoneProgress, type CycleZone, type SerializedEntry, type SerializedTag } from "@/lib/cycle-count";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import { Badge, Card, ProgressBar } from "@/components/ui";
import { ScannerOverlay } from "@/components/conteos/ScannerOverlay";
import { useTono } from "@/components/conteos/tono";

// Captura del conteo. Compartida entre movil y escritorio.

type CountDetail = {
  id: string;
  date: string;
  status: string;
  theoretical: number | null;
  /** KARDEX = calculado en vivo desde la ronda; MANUAL = capturado en su día. */
  theoreticalSource: "KARDEX" | "MANUAL" | null;
  theoreticalRound: string | null;
  notes: string | null;
  noUpcItems: Array<{ id: string; concept: string; pieces: number }>;
};

type TagRow = Omit<SerializedTag, "active">;

export function ConteoDetailView({ countId: id, desktop = false }: { countId: string; desktop?: boolean }) {
  const tono = useTono();
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [count, setCount] = useState<CountDetail | null>(null);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [entries, setEntries] = useState<Map<string, SerializedEntry>>(new Map());
  const [zone, setZone] = useState<CycleZone>("PISO");
  const [active, setActive] = useState<TagRow | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // Sugerencia del servidor: reusa un marbete desactivado si lo hay. El cliente
  // no puede calcularla porque solo recibe los ACTIVOS.
  const [suggestedTag, setSuggestedTag] = useState<number | null>(null);
  // Marbetes de bodega dados de alta pero apagados: no viajan en `tags`, así
  // que sin esta lista son invisibles y no habría forma de volver a encenderlos.
  const [disabledTags, setDisabledTags] = useState<number[]>([]);
  // Presencia en vivo (solo escritorio, solo gerencia): quién cuenta qué marbete.
  const [present, setPresent] = useState<Array<{ userId: string; userName: string; tagNumber: number }>>([]);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) { router.replace("/login"); return; }
      setSession(s);
    });
  }, [router]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/conteos/${id}`, { cache: "no-store" });
      if (res.status === 404) { setNotFound(true); return; }
      const data = (await res.json()) as { count?: CountDetail; tags?: TagRow[]; entries?: SerializedEntry[]; suggestedBodegaTag?: number; disabledBodegaTags?: number[] };
      if (!data.count) return;
      setCount(data.count);
      setTags(data.tags ?? []);
      setEntries(new Map((data.entries ?? []).map((entry) => [entry.tagId, entry])));
      setSuggestedTag(data.suggestedBodegaTag ?? null);
      setDisabledTags(data.disabledBodegaTags ?? []);
    } catch {
      // Fallo de red transitorio: el poll corre cada pocos segundos (señal
      // intermitente, app en segundo plano, o navegó a otra pantalla a medio
      // request). El siguiente poll reintenta solo; no es un error real, así que
      // se ignora en vez de subir como "unhandledrejection" a Sentry.
    }
  }, [id]);

  // Avance en vivo: varias personas capturan a la vez. Con el conteo abierto
  // el poll es de 3 s (casi en vivo); cerrado baja a 30 s. Al volver la app al
  // frente se refresca de inmediato.
  const pollMs = count?.status === "OPEN" ? 3_000 : 30_000;
  useEffect(() => {
    if (!session) return;
    void load();
    const interval = setInterval(() => { void load(); }, pollMs);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, load, pollMs]);

  const manager = session?.role === "GERENTE" || session?.role === "SUBGERENTE";
  const isOpen = count?.status === "OPEN";

  // Poll de presencia: solo en escritorio y con el conteo abierto.
  useEffect(() => {
    if (!desktop || !session || count?.status !== "OPEN") { setPresent([]); return; }
    let cancelled = false;
    const poll = () => {
      fetch(`/api/conteos/${id}/presence`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() as Promise<{ present: typeof present }> : { present: [] })
        .then((data) => { if (!cancelled) setPresent(data.present ?? []); })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 4_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [desktop, session, count?.status, id]);

  const countingByNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const person of present) map.set(person.tagNumber, person.userName);
    return map;
  }, [present]);
  const progress = useMemo(() => ({
    PISO: zoneProgress("PISO", tags, entries),
    BODEGA: zoneProgress("BODEGA", tags, entries)
  }), [tags, entries]);
  const zoneTags = useMemo(() => tags.filter((tag) => tag.zone === zone), [tags, zone]);
  const totalPieces = progress.PISO.pieces + progress.BODEGA.pieces + (count?.noUpcItems.reduce((t, i) => t + i.pieces, 0) ?? 0);

  function fmt(iso: string) {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  }

  async function toggleStatus() {
    if (!count) return;
    const closing = count.status === "OPEN";
    const pending = progress.PISO.pendingNumbers.length + progress.BODEGA.pendingNumbers.length;
    if (closing && pending > 0 && !confirm(`Faltan ${pending} marbetes por contar. ¿Cerrar de todos modos?`)) return;
    try {
      await fetch(`/api/conteos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: closing ? "CLOSED" : "OPEN" })
      });
      await load();
    } catch {
      // Red intermitente: el estado no cambió. El poll mantiene el actual.
    }
  }

  if (notFound) {
    return <p className="py-10 text-center text-sm font-bold text-muted">Conteo no encontrado.</p>;
  }

  return (
    <div className={desktop ? "mx-auto max-w-2xl" : undefined}>
      {count && (
        <p className="mb-2 text-sm font-semibold text-ink">{fmt(count.date)} · <span className="font-semibold text-muted">{isOpen ? "Toca un marbete para capturar" : "Conteo cerrado"}</span></p>
      )}
        {!count ? (
          <p className="py-8 text-center text-sm font-bold text-muted">Cargando…</p>
        ) : (
          <>
            {/* Avance */}
            <Card className="mb-3 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Avance del conteo</p>
                <Badge tone={isOpen ? "success" : "default"}>{isOpen ? "En curso" : "Cerrado"}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {(["PISO", "BODEGA"] as const).map((z) => (
                  <div key={z}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-semibold text-ink">{z === "PISO" ? "Piso de venta" : "Bodega"}</span>
                      <span className="text-xs font-semibold tabular-nums text-muted">{progress[z].counted}/{progress[z].total}</span>
                    </div>
                    <ProgressBar value={progress[z].total > 0 ? (progress[z].counted / progress[z].total) * 100 : 0} />
                    {manager && <p className="mt-1 text-[11px] font-semibold text-muted">{progress[z].pieces.toLocaleString("es-MX")} pzas</p>}
                  </div>
                ))}
              </div>
              {manager && (
                <p className="mt-2 border-t border-line pt-2 text-xs font-semibold text-ink">
                  Total: {totalPieces.toLocaleString("es-MX")} piezas
                  {count.theoretical !== null && (
                    <span className={`ml-2 ${totalPieces - count.theoretical === 0 ? tono("text-mint", "text-emerald-500") : tono("text-orchid", "text-rose-500")}`}>
                      ({totalPieces - count.theoretical >= 0 ? "+" : ""}{(totalPieces - count.theoretical).toLocaleString("es-MX")} vs Kardex {count.theoretical.toLocaleString("es-MX")})
                    </span>
                  )}
                </p>
              )}
              {(progress.PISO.discrepancies + progress.BODEGA.discrepancies) > 0 && (
                <p className={`mt-1.5 flex items-center gap-1 text-[11px] font-bold ${tono("text-ember", "text-amber-600")}`}>
                  <AlertTriangle size={12} /> {progress.PISO.discrepancies + progress.BODEGA.discrepancies} marbete(s) con diferencia esperan 3er conteo
                </p>
              )}
            </Card>

            {/* Zona + escáner */}
            <div className="mb-3 flex items-center gap-1.5">
              <div className={`flex min-w-0 flex-1 rounded-full p-1 ${tono("bg-panel", "bg-slate-100 dark:bg-[#1a2540]")}`}>
                {(["PISO", "BODEGA"] as const).map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZone(z)}
                    className={`min-h-10 flex-1 rounded-full text-sm font-semibold transition ${zone === z ? tono("bg-white text-ink shadow-sm dark:bg-panel", "bg-white text-ink shadow-sm dark:bg-slate-700") : "text-muted"}`}
                  >
                    {z === "PISO" ? "Piso de venta" : "Bodega"}
                  </button>
                ))}
              </div>
              {isOpen && (
                <button
                  type="button"
                  onClick={() => setScanning(true)}
                  aria-label="Escanear marbete"
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-volt text-white shadow-[0_6px_16px_rgb(37_99_235/0.3)] transition active:scale-95"
                >
                  <ScanLine size={19} />
                </button>
              )}
            </div>

            {/* Alta de marbete a media captura. Solo bodega y solo con el
                conteo abierto: el piso se marbetea de antemano. */}
            {manager && isOpen && zone === "BODEGA" && (
              <AddBodegaTag countId={id} suggested={suggestedTag} disabled={disabledTags} onAdded={load} />
            )}

            {/* Grid de marbetes */}
            {zoneTags.length === 0 ? (
              <Card className="p-4 text-sm font-semibold text-muted">Sin marbetes en esta zona.</Card>
            ) : (
              <div className={`grid gap-1.5 ${desktop ? "grid-cols-8" : "grid-cols-4"}`}>
                {zoneTags.map((tag) => {
                  const entry = entries.get(tag.id) ?? null;
                  const real = entry ? entryReal(entry) : null;
                  // En conteo ciego solo llegan no-null las piezas que capturó el
                  // propio asesor: su conteo más reciente en este marbete.
                  const myOwn = entry ? (entry.count3 ?? entry.count2 ?? entry.count1) : null;
                  const resolved = entry ? entryResolved(entry) : false;
                  const needsRecount = entry ? entryNeedsRecount(entry) : false;
                  const countsDone = entry ? entryCountsDone(entry) : 0;
                  const counter = countingByNumber.get(tag.number);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => setActive(tag)}
                      className={`relative flex min-h-[3.4rem] flex-col items-center justify-center rounded-2xl border text-center transition active:scale-95 ${
                        counter
                          ? "border-volt/60 bg-volt/10 ring-2 ring-volt/30"
                          : needsRecount
                            ? tono("border-ember/30 bg-ember/10", "border-amber-400/60 bg-amber-500/10")
                            : resolved
                              ? tono("border-mint/30 bg-mint/10", "border-emerald-400/40 bg-emerald-500/10")
                              : "border-line bg-panel"
                      }`}
                    >
                      {counter ? (
                        <span className="absolute -right-1 -top-1 flex size-3">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-volt/60" />
                          <span className="relative inline-flex size-3 rounded-full bg-volt ring-2 ring-card" />
                        </span>
                      ) : null}
                      {countsDone > 0 ? (
                        <span
                          title={`${countsDone}° conteo`}
                          className={`absolute left-1 top-1 grid size-4 place-items-center rounded-full text-[9px] font-semibold leading-none text-white ${
                            countsDone >= 3 ? tono("bg-purple", "bg-purple-500") : countsDone === 2 ? tono("bg-ember", "bg-amber-500") : tono("bg-muted", "bg-slate-500")
                          }`}
                        >
                          {countsDone}
                        </span>
                      ) : null}
                      <span className={`text-sm font-semibold ${resolved ? tono("text-mint", "text-emerald-600 dark:text-emerald-400") : "text-ink"}`}>{tag.number}</span>
                      <span className="text-[10px] font-bold text-muted">
                        {needsRecount ? "⚠ recontar" : manager ? (real !== null ? `${real} pzas` : "—") : myOwn !== null ? `${myOwn} pzas` : resolved ? "✓" : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Piezas sin UPC + acciones de gerencia */}
            {manager && (
              <ManagerPanel
                countId={id}
                count={count}
                isOpen={!!isOpen}
                canDelete={!!session?.platformAdmin}
                onChanged={load}
                onToggleStatus={toggleStatus}
                onDelete={async () => {
                  try {
                    const res = await fetch(`/api/conteos/${id}`, { method: "DELETE" });
                    if (res.ok) router.replace(desktop ? "/escritorio/conteos" : "/conteos");
                  } catch {
                    // Red intermitente: no se eliminó. El usuario puede reintentar.
                  }
                }}
              />
            )}
          </>
        )}

      <AnimatePresence>
        {scanning && (
          <ScannerOverlay
            key="scanner"
            onClose={() => setScanning(false)}
            onScan={(number) => {
              const tag = tags.find((candidate) => candidate.number === number);
              if (tag) {
                setScanning(false);
                setZone(tag.zone);
                setActive(tag);
                if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(80);
              }
            }}
          />
        )}
        {active && count && (
          <CaptureSheet
            key={active.id}
            countId={id}
            tag={active}
            entry={entries.get(active.id) ?? null}
            isOpen={!!isOpen}
            onClose={() => setActive(null)}
            onSaved={(entry) => {
              setEntries((prev) => new Map(prev).set(entry.tagId, entry));
              setActive(null);
            }}
          />
        )}
      </AnimatePresence>

      {desktop ? <LivePresence present={present} /> : null}
    </div>
  );
}

// Burbujas flotantes (solo escritorio): quién está contando en vivo. No invasivo:
// abajo a la derecha, con avatar, nombre y un punto que late.
function LivePresence({ present }: { present: Array<{ userId: string; userName: string; tagNumber: number }> }) {
  const tono = useTono();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-30 flex flex-col items-end gap-2">
      <AnimatePresence>
        {present.map((person) => {
          const first = person.userName.trim().split(/\s+/)[0];
          return (
            <motion.div
              key={person.userId}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="flex items-center gap-2.5 rounded-full border border-line bg-card/95 py-1.5 pl-1.5 pr-3.5 shadow-[0_8px_24px_rgb(15_23_42/0.14)] backdrop-blur-xl"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-volt text-xs font-semibold text-white">
                {first.slice(0, 2).toUpperCase()}
              </span>
              <span className="text-[13px] font-bold text-ink">
                <span className="font-semibold">{first}</span> está contando el <span className="font-semibold text-volt">marbete {person.tagNumber}</span>
              </span>
              <span className="relative flex size-2.5">
                <span className={`absolute inline-flex size-full animate-ping rounded-full ${tono("bg-mint/70", "bg-emerald-400/70")}`} />
                <span className={`relative inline-flex size-2.5 rounded-full ${tono("bg-mint", "bg-emerald-500")}`} />
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}


// ── Captura de un marbete (bottom sheet con teclado numérico) ────────────────
function CaptureSheet({ countId, tag, entry, isOpen, onClose, onSaved }: {
  countId: string;
  tag: TagRow;
  entry: SerializedEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (entry: SerializedEntry) => void;
}) {
  const tono = useTono();
  // Slot sugerido: 1 si no hay conteo; con diferencia pendiente → 3; ya
  // contado → corrección del 1ro (autor/gerencia) o 2do conteo. Usa slotFilled
  // porque en conteo ciego las piezas vienen en null.
  const suggested = !entry || !slotFilled(entry, 1) ? 1 : entryNeedsRecount(entry) ? 3 : 2;
  const [slot, setSlot] = useState<1 | 2 | 3>(suggested as 1 | 2 | 3);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const keyboardInset = useKeyboardInset();

  useEffect(() => { inputRef.current?.focus(); }, []);

  /**
   * ⚠️ La hoja se monta en `document.body`, NO donde vive el componente.
   *
   * `AppFrame` es un `motion.main` animado: su `transform` crea un *containing
   * block* y un contexto de apilamiento, así que `fixed inset-0 z-80` quedaba
   * encerrado dentro de él. La barra inferior vive FUERA de `AppFrame` con
   * `z-30`, y por estar fuera se pintaba ENCIMA de la hoja por mucho z-index
   * que esta declarara: el botón de guardar quedaba debajo de la barra y el
   * toque se lo llevaba la barra.
   *
   * Es la misma trampa que ya avisan `PageTransition` y `AppChrome`: cualquier
   * transform en un ancestro rompe el `position: fixed` de sus hijos. Sacarlo a
   * un portal es lo único que lo arregla de raíz.
   */
  const portalTarget = typeof document === "undefined" ? null : document.body;

  // Presencia en vivo: mientras esta hoja está abierta, avisa cada 5 s que estoy
  // contando este marbete (gerencia lo ve en escritorio). Al cerrar, salgo.
  useEffect(() => {
    if (!isOpen) return;
    const beat = () => {
      void fetch(`/api/conteos/${countId}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagNumber: tag.number })
      }).catch(() => {});
    };
    beat();
    const interval = setInterval(beat, 5_000);
    return () => {
      clearInterval(interval);
      void fetch(`/api/conteos/${countId}/presence`, { method: "DELETE" }).catch(() => {});
    };
  }, [countId, tag.number, isOpen]);

  async function save() {
    const pieces = parseInt(value, 10);
    if (!Number.isFinite(pieces) || pieces < 0) { setError("Captura las piezas."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/conteos/${countId}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: tag.id, pieces, slot })
      });
      const data = (await res.json()) as { entry?: SerializedEntry; error?: string };
      if (data.error) { setError(data.error); return; }
      if (data.entry) onSaved(data.entry);
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  if (!portalTarget) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-80 flex items-end justify-center bg-black/50 p-3 backdrop-blur-xs"
      // El teclado tapaba el botón de guardar: la hoja se levanta por encima de
      // él. En iOS es obligatorio — ahí el teclado NO encoge el viewport.
      style={{ paddingBottom: keyboardInset + 12 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        exit={{ y: 80 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        // Con el teclado abierto queda poca altura: que la hoja haga scroll por
        // dentro en vez de recortar lo de abajo.
        className="max-h-full w-full max-w-md overflow-y-auto rounded-[26px] border border-line bg-card p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{tag.zone === "PISO" ? "Piso de venta" : "Bodega"}</p>
            <p className="text-xl font-semibold text-ink">Marbete {tag.number}{tag.label ? ` · ${tag.label}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className={`grid size-9 place-items-center rounded-full text-muted ${tono("bg-muted/10", "bg-slate-500/10")}`}><X size={16} /></button>
        </div>

        {entry !== null && slotFilled(entry, 1) && (
          // Conteo ciego: cada conteo muestra sus piezas SOLO a quien lo capturó
          // (y a gerencia). El de otra persona sale como "oculto" con su nombre,
          // para que el asesor vea SU propio conteo pero no copie el ajeno.
          <div className={`mt-2 rounded-2xl px-3 py-2 text-xs font-semibold text-muted ${tono("bg-muted/10", "bg-slate-500/10")}`}>
            1er conteo: {entry.count1 !== null ? <b className="text-ink">{entry.count1} pzas</b> : <span className="opacity-70">oculto</span>} · {entry.count1ByName}
            {slotFilled(entry, 2) && <> — 2do: {entry.count2 !== null ? <b className="text-ink">{entry.count2} pzas</b> : <span className="opacity-70">oculto</span>} · {entry.count2ByName}</>}
            {slotFilled(entry, 3) && <> — 3ro: {entry.count3 !== null ? <b className="text-ink">{entry.count3} pzas</b> : <span className="opacity-70">oculto</span>} · {entry.count3ByName}</>}
          </div>
        )}

        {isOpen ? (
          <>
            {entry !== null && slotFilled(entry, 1) && (
              <div className="mt-2.5 flex gap-1.5">
                {([1, 2, 3] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlot(s)}
                    disabled={(s === 2 && !slotFilled(entry, 1)) || (s === 3 && !slotFilled(entry, 2))}
                    className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-semibold transition disabled:opacity-35 ${slot === s ? "bg-volt text-white" : tono("bg-muted/10 text-muted", "bg-slate-500/10 text-muted")}`}
                  >
                    {s === 1 ? "Corregir 1er" : s === 2 ? "2do conteo" : "3er conteo"}
                  </button>
                ))}
              </div>
            )}
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => setValue(event.target.value.replace(/\D/g, "").slice(0, 5))}
              onKeyDown={(event) => {
                // Atajo para escritorio y teclado físico. ⚠️ En teléfono NO
                // sirve: el teclado numérico no trae Enter en iOS ni en
                // Android, así que `enterKeyHint` no pinta nada y el botón de
                // abajo es la única manera de guardar. De ahí que el modal se
                // levante por encima del teclado (`useKeyboardInset`).
                if (event.key === "Enter" && !saving && value !== "") { event.preventDefault(); void save(); }
              }}
              inputMode="numeric"
              enterKeyHint="done"
              placeholder="0"
              aria-label={`Piezas del marbete ${tag.number}`}
              className={`mt-3 min-h-16 w-full rounded-2xl border border-line px-4 text-center text-3xl font-semibold tabular-nums text-ink outline-hidden focus:border-volt ${tono("bg-volt/10", "bg-blue-50 dark:bg-[#1a2540]")}`}
            />
            {error && <p className={`mt-1.5 text-xs font-semibold ${tono("text-orchid", "text-red-500")}`}>{error}</p>}
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || value === ""}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-volt py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              <CheckCircle2 size={17} /> {saving ? "Guardando…" : "Guardar piezas"}
            </button>
          </>
        ) : (
          <p className="mt-3 text-sm font-semibold text-muted">El conteo está cerrado; ya no se puede capturar.</p>
        )}
      </motion.div>
    </motion.div>,
    portalTarget
  );
}

// ── Panel de gerencia: sin UPC, cerrar/reabrir, exportar ─────────────────────
function ManagerPanel({ countId, count, isOpen, canDelete, onChanged, onToggleStatus, onDelete }: {
  countId: string;
  count: CountDetail;
  isOpen: boolean;
  canDelete: boolean;
  onChanged: () => Promise<void>;
  onToggleStatus: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const tono = useTono();
  const [concept, setConcept] = useState("");
  const [pieces, setPieces] = useState("");
  const [busy, setBusy] = useState(false);
  const [kardex, setKardex] = useState(count.theoretical !== null ? String(count.theoretical) : "");
  const [kardexSaved, setKardexSaved] = useState(false);

  async function saveKardex() {
    const parsed = kardex === "" ? null : parseInt(kardex, 10);
    if (parsed !== null && !Number.isFinite(parsed)) return;
    setBusy(true);
    try {
      await fetch(`/api/conteos/${countId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theoretical: parsed })
      });
      setKardexSaved(true);
      setTimeout(() => setKardexSaved(false), 2000);
      await onChanged();
    } catch {
      // Red intermitente: no se guardó. El usuario puede reintentar.
    } finally {
      setBusy(false);
    }
  }

  async function addNoUpc() {
    const parsed = parseInt(pieces, 10);
    if (!concept.trim() || !Number.isFinite(parsed)) return;
    setBusy(true);
    try {
      await fetch(`/api/conteos/${countId}/no-upc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept: concept.trim(), pieces: parsed })
      });
      setConcept("");
      setPieces("");
      await onChanged();
    } catch {
      // Red intermitente: no se agregó. El usuario puede reintentar.
    } finally {
      setBusy(false);
    }
  }

  async function removeNoUpc(itemId: string) {
    try {
      await fetch(`/api/conteos/${countId}/no-upc`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId })
      });
      await onChanged();
    } catch {
      // Red intermitente: no se quitó. El usuario puede reintentar.
    }
  }

  return (
    <Card className="mt-3 p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Mesa de control</p>

      {/* Inventario Kardex (teórico). Ya NO se teclea cuando hay ronda abierta:
          sale del kardex calculado a la fecha del conteo y se actualiza solo
          conforme entran las ventas del día y los días atrasados. El campo
          manual sobrevive únicamente para conteos sin ronda que los sostenga. */}
      <div className="mt-2">
        <p className="text-xs font-semibold text-ink">Inventario Kardex (teórico)</p>
        {count.theoreticalSource === "KARDEX" ? (
          <div className="mt-1.5 rounded-2xl border border-line bg-panel px-3 py-2.5">
            <p className="text-lg font-semibold tabular-nums text-ink">
              {count.theoretical?.toLocaleString("es-MX")} <span className="text-xs font-semibold text-muted">piezas</span>
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-muted">
              Del kardex{count.theoreticalRound ? ` · ${count.theoreticalRound}` : ""} · se actualiza solo
            </p>
          </div>
        ) : (
          <>
            <div className="mt-1.5 flex gap-1.5">
              <input
                value={kardex}
                onChange={(e) => setKardex(e.target.value.replace(/\D/g, "").slice(0, 7))}
                inputMode="numeric"
                placeholder="Piezas según sistema"
                aria-label="Inventario Kardex"
                disabled={!isOpen}
                className="min-w-0 flex-1 rounded-2xl border border-line bg-panel px-3 py-2 text-sm font-semibold tabular-nums text-ink outline-hidden focus:border-volt disabled:opacity-60"
              />
              {isOpen && (
                <button
                  type="button"
                  onClick={() => void saveKardex()}
                  disabled={busy}
                  className={`shrink-0 rounded-2xl px-4 text-sm font-semibold transition active:scale-95 disabled:opacity-50 ${kardexSaved ? tono("bg-mint text-white", "bg-emerald-500/15 text-emerald-600") : "bg-volt text-white"}`}
                >
                  {kardexSaved ? "✓" : "Guardar"}
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] font-semibold text-muted">Sin ronda de kardex abierta hay que capturarlo a mano.</p>
          </>
        )}
      </div>

      {/* Piezas sin UPC */}
      <div className="mt-2">
        <p className="text-xs font-semibold text-ink">Piezas sin UPC</p>
        {count.noUpcItems.map((item) => (
          <div key={item.id} className="mt-1.5 flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-semibold text-ink">{item.concept}</span>
            <span className="font-semibold tabular-nums text-ink">{item.pieces}</span>
            {isOpen && (
              <button type="button" onClick={() => void removeNoUpc(item.id)} aria-label="Quitar" className={`grid size-7 place-items-center rounded-full ${tono("bg-orchid/12 text-orchid", "bg-red-500/10 text-red-500")}`}><Trash2 size={13} /></button>
            )}
          </div>
        ))}
        {isOpen && (
          <div className="mt-2 flex gap-1.5">
            <input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Concepto" className="min-w-0 flex-1 rounded-2xl border border-line bg-panel px-3 py-2 text-sm font-semibold text-ink outline-hidden focus:border-volt" />
            <input value={pieces} onChange={(e) => setPieces(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="Pzas" className="w-20 rounded-2xl border border-line bg-panel px-3 py-2 text-center text-sm font-semibold text-ink outline-hidden focus:border-volt" />
            <button type="button" onClick={() => void addNoUpc()} disabled={busy} aria-label="Agregar" className="grid size-10 shrink-0 place-items-center rounded-2xl bg-volt text-white transition active:scale-95 disabled:opacity-50"><Plus size={16} /></button>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-3">
        <a
          href={`/api/conteos/${countId}/export`}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition active:scale-95 ${tono("border border-volt/35 bg-card text-volt", "bg-blue-500/10 text-blue-600 dark:text-blue-400")}`}
        >
          <Download size={14} /> Mesa de control (Excel)
        </a>
        <button
          type="button"
          onClick={() => void onToggleStatus()}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition active:scale-95 ${isOpen ? tono("bg-muted/15 text-muted", "bg-slate-500/15 text-muted") : tono("border border-mint/40 bg-card text-mint", "bg-emerald-500/15 text-emerald-600")}`}
        >
          {isOpen ? <><Lock size={14} /> Cerrar conteo</> : <><LockOpen size={14} /> Reabrir</>}
        </button>
      </div>

      {/* Eliminar: solo administrador de plataforma (depurar pruebas) */}
      {canDelete && (
        <button
          type="button"
          onClick={() => {
            if (confirm("¿Eliminar este conteo con TODAS sus capturas? Esta acción no se puede deshacer.")) void onDelete();
          }}
          className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition active:scale-95 ${tono("border border-orchid/40 bg-card text-orchid", "bg-red-500/10 text-red-500")}`}
        >
          <Trash2 size={14} /> Eliminar conteo (admin)
        </button>
      )}
    </Card>
  );
}

// -- Alta de marbete con el conteo abierto (solo bodega) ---------------------
//
// Va EN LINEA, no en una ventana flotante: el modal de captura ya nos costo
// dos fallos seguidos en telefono (el teclado tapando el boton y la barra
// inferior comiendose el toque). Un bloque en el flujo normal de la pagina
// hace scroll solo cuando sube el teclado y no pelea con nada.
function AddBodegaTag({ countId, suggested, disabled, onAdded }: { countId: string; suggested: number | null; disabled: number[]; onAdded: () => void }) {
  const tono = useTono();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  // Marbetes apagados que se van a volver a habilitar. Multiple a proposito:
  // apagar un tramo entero es lo normal, y volver a encenderlo de uno en uno
  // son veinte viajes y veinte oportunidades de teclear mal.
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function send(payload: { number?: number; numbers?: number[]; label?: string }) {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await fetch(`/api/conteos/${countId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await res.json()) as { added?: number[]; reactivated?: number[]; error?: string };
      if (!res.ok) { setError(data.error ?? "No se pudo agregar el marbete."); return; }
      const total = (data.added?.length ?? 0) + (data.reactivated?.length ?? 0);
      setDone(`${total} marbete${total === 1 ? "" : "s"} listo${total === 1 ? "" : "s"} para capturar.`);
      setNumber("");
      setLabel("");
      setPicked([]);
      onAdded();
    } catch {
      setError("Sin conexion. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm font-semibold text-muted transition active:scale-95"
      >
        <Plus size={16} /> Agregar marbete a bodega
        {disabled.length > 0 ? <span className="text-[11px] font-bold text-volt">({disabled.length} apagados)</span> : null}
      </button>
    );
  }

  const allPicked = disabled.length > 0 && picked.length === disabled.length;

  return (
    <Card className="mb-3 p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Marbetes de bodega</p>
        <button type="button" onClick={() => { setOpen(false); setError(""); setDone(""); }} aria-label="Cerrar" className={`grid size-8 place-items-center rounded-full text-muted ${tono("bg-muted/10", "bg-slate-500/10")}`}><X size={14} /></button>
      </div>

      {/* Apagados: se habilitan tocandolos. Reusarlos es mejor que estrenar un
          numero, porque su etiqueta ya se imprimio y sigue pegada al mueble. */}
      {disabled.length > 0 ? (
        <div className="mt-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink">Deshabilitados ({disabled.length})</p>
            <button
              type="button"
              onClick={() => setPicked(allPicked ? [] : [...disabled])}
              className="text-[11px] font-bold text-volt"
            >
              {allPicked ? "Ninguno" : "Todos"}
            </button>
          </div>
          <div className="mt-1.5 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {disabled.map((tagNumber) => {
              const on = picked.includes(tagNumber);
              return (
                <button
                  key={tagNumber}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked((prev) => (on ? prev.filter((value) => value !== tagNumber) : [...prev, tagNumber]))}
                  className={`min-h-9 min-w-11 rounded-xl px-2 text-xs font-semibold tabular-nums transition active:scale-95 ${on ? "bg-volt text-white" : "bg-panel text-muted ring-1 ring-line"}`}
                >
                  {tagNumber}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void send({ numbers: picked })}
            disabled={busy || picked.length === 0}
            className="mt-2 min-h-11 w-full rounded-2xl bg-volt text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
          >
            {busy ? "Habilitando..." : picked.length > 0 ? `Habilitar ${picked.length}` : "Selecciona cuales habilitar"}
          </button>
        </div>
      ) : null}

      {/* Un marbete que nunca existio */}
      <div className={disabled.length > 0 ? "mt-3 border-t border-line pt-3" : "mt-2.5"}>
        <p className="text-xs font-semibold text-ink">Uno nuevo</p>
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={number}
            onChange={(event) => setNumber(event.target.value.replace(/\D/g, "").slice(0, 5))}
            inputMode="numeric"
            placeholder={suggested === null ? "N.º" : String(suggested)}
            aria-label="Numero del marbete"
            className="w-20 shrink-0 rounded-2xl border border-line bg-panel px-2 py-2 text-center text-sm font-semibold tabular-nums text-ink outline-hidden focus:border-volt"
          />
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value.slice(0, 60))}
            placeholder="Donde esta (opcional)"
            aria-label="Etiqueta del marbete"
            className="min-w-0 flex-1 rounded-2xl border border-line bg-panel px-3 py-2 text-sm font-semibold text-ink outline-hidden focus:border-volt"
          />
          <button
            type="button"
            onClick={() => void send({ number: number.trim() === "" ? undefined : Number(number), label: label.trim() || undefined })}
            disabled={busy}
            className="shrink-0 rounded-2xl bg-volt px-4 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
          >
            Agregar
          </button>
        </div>
        <p className="mt-1 text-[11px] font-semibold text-muted">
          {suggested === null
            ? "Sin numero se usa el siguiente libre."
            : `Sin numero se usa el ${suggested}. Si estrenas numero, imprime su etiqueta desde Marbetes para poder escanearlo.`}
        </p>
      </div>

      {error ? <p className={`mt-2 text-xs font-semibold ${tono("text-orchid", "text-red-500")}`}>{error}</p> : null}
      {done && !error ? <p className={`mt-2 text-xs font-semibold ${tono("text-mint", "text-emerald-600 dark:text-emerald-400")}`}>{done}</p> : null}
    </Card>
  );
}
