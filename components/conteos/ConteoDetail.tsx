"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Download, Lock, LockOpen, Plus, ScanLine, Trash2, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { entryCountsDone, entryNeedsRecount, entryReal, parseTagQr, zoneProgress, type CycleZone, type SerializedEntry, type SerializedTag } from "@/lib/cycle-count";
import { Badge, Card, ProgressBar } from "@/components/ui";

// Captura del conteo. Compartida entre movil y escritorio.

type CountDetail = {
  id: string;
  date: string;
  status: string;
  theoretical: number | null;
  notes: string | null;
  noUpcItems: Array<{ id: string; concept: string; pieces: number }>;
};

type TagRow = Omit<SerializedTag, "active">;

export function ConteoDetailView({ countId: id, desktop = false }: { countId: string; desktop?: boolean }) {
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [count, setCount] = useState<CountDetail | null>(null);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [entries, setEntries] = useState<Map<string, SerializedEntry>>(new Map());
  const [zone, setZone] = useState<CycleZone>("PISO");
  const [active, setActive] = useState<TagRow | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // Presencia en vivo (solo escritorio, solo gerencia): quién cuenta qué marbete.
  const [present, setPresent] = useState<Array<{ userId: string; userName: string; tagNumber: number }>>([]);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) { router.replace("/login"); return; }
      setSession(s);
    });
  }, [router]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/conteos/${id}`, { cache: "no-store" });
    if (res.status === 404) { setNotFound(true); return; }
    const data = (await res.json()) as { count?: CountDetail; tags?: TagRow[]; entries?: SerializedEntry[] };
    if (!data.count) return;
    setCount(data.count);
    setTags(data.tags ?? []);
    setEntries(new Map((data.entries ?? []).map((entry) => [entry.tagId, entry])));
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
    await fetch(`/api/conteos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: closing ? "CLOSED" : "OPEN" })
    });
    await load();
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
                    <p className="mt-1 text-[11px] font-semibold text-muted">{progress[z].pieces.toLocaleString("es-MX")} pzas</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 border-t border-line pt-2 text-xs font-semibold text-ink">
                Total: {totalPieces.toLocaleString("es-MX")} piezas
                {count.theoretical !== null && (
                  <span className={`ml-2 ${totalPieces - count.theoretical === 0 ? "text-emerald-500" : "text-rose-500"}`}>
                    ({totalPieces - count.theoretical >= 0 ? "+" : ""}{(totalPieces - count.theoretical).toLocaleString("es-MX")} vs Kardex {count.theoretical.toLocaleString("es-MX")})
                  </span>
                )}
              </p>
              {(progress.PISO.discrepancies + progress.BODEGA.discrepancies) > 0 && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-amber-600">
                  <AlertTriangle size={12} /> {progress.PISO.discrepancies + progress.BODEGA.discrepancies} marbete(s) con diferencia esperan 3er conteo
                </p>
              )}
            </Card>

            {/* Zona + escáner */}
            <div className="mb-3 flex items-center gap-1.5">
              <div className="flex min-w-0 flex-1 rounded-full bg-slate-100 p-1 dark:bg-[#1a2540]">
                {(["PISO", "BODEGA"] as const).map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZone(z)}
                    className={`min-h-10 flex-1 rounded-full text-sm font-semibold transition ${zone === z ? "bg-white text-ink shadow dark:bg-slate-700" : "text-muted"}`}
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
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-volt text-white shadow-[0_6px_16px_rgb(37_99_235_/_0.3)] transition active:scale-95"
                >
                  <ScanLine size={19} />
                </button>
              )}
            </div>

            {/* Grid de marbetes */}
            {zoneTags.length === 0 ? (
              <Card className="p-4 text-sm font-semibold text-muted">Sin marbetes en esta zona.</Card>
            ) : (
              <div className={`grid gap-1.5 ${desktop ? "grid-cols-8" : "grid-cols-4"}`}>
                {zoneTags.map((tag) => {
                  const entry = entries.get(tag.id) ?? null;
                  const real = entry ? entryReal(entry) : null;
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
                            ? "border-amber-400/60 bg-amber-500/10"
                            : real !== null
                              ? "border-emerald-400/40 bg-emerald-500/10"
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
                            countsDone >= 3 ? "bg-purple-500" : countsDone === 2 ? "bg-amber-500" : "bg-slate-500"
                          }`}
                        >
                          {countsDone}
                        </span>
                      ) : null}
                      <span className={`text-sm font-semibold ${real !== null ? "text-emerald-600 dark:text-emerald-400" : "text-ink"}`}>{tag.number}</span>
                      <span className="text-[10px] font-bold text-muted">{needsRecount ? "⚠ recontar" : real !== null ? `${real} pzas` : "—"}</span>
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
                  const res = await fetch(`/api/conteos/${id}`, { method: "DELETE" });
                  if (res.ok) router.replace(desktop ? "/escritorio/conteos" : "/conteos");
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
              className="flex items-center gap-2.5 rounded-full border border-line bg-card/95 py-1.5 pl-1.5 pr-3.5 shadow-[0_8px_24px_rgb(15_23_42_/_0.14)] backdrop-blur-xl"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-volt text-xs font-semibold text-white">
                {first.slice(0, 2).toUpperCase()}
              </span>
              <span className="text-[13px] font-bold text-ink">
                <span className="font-semibold">{first}</span> está contando el <span className="font-semibold text-volt">marbete {person.tagNumber}</span>
              </span>
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ── Escáner de marbetes QR (cámara trasera + BarcodeDetector) ────────────────
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

function ScannerOverlay({ onScan, onClose }: { onScan: (number: number) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  // El callback vive en un ref: si dependiera del efecto, cada re-render del
  // padre (poll en vivo) reiniciaría la cámara — en iPhone eso re-pedía el
  // permiso y tiraba la primera lectura.
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let handled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador no tiene acceso a la cámara. Toca el marbete en la lista para capturarlo.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        setError("Sin acceso a la cámara. Da permiso o captura desde la lista.");
        return;
      }
      if (cancelled || !videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);

      const handleText = (text: string): boolean => {
        if (handled) return true;
        const number = parseTagQr(text);
        if (number !== null) {
          handled = true;
          if (interval) clearInterval(interval);
          onScanRef.current(number);
          return true;
        }
        return false;
      };

      if (window.BarcodeDetector) {
        // Chrome/Android: detector nativo.
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        interval = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const codes = await detector.detect(videoRef.current);
            for (const code of codes) if (handleText(code.rawValue)) return;
          } catch { /* frame no disponible: reintentar en el siguiente tick */ }
        }, 250);
      } else {
        // iPhone/Safari: sin BarcodeDetector — decodificar frames con jsQR.
        const { default: jsQR } = await import("jsqr");
        if (cancelled) return;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        interval = setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2 || !context) return;
          // Reducir el frame (~480 px) para decodificar rápido sin calentar el cel.
          const scale = Math.min(1, 480 / (video.videoWidth || 480));
          canvas.width = Math.round((video.videoWidth || 480) * scale);
          canvas.height = Math.round((video.videoHeight || 640) * scale);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
          if (code) handleText(code.data);
        }, 300);
      }
    })();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // La cámara arranca UNA sola vez por apertura del escáner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[85] flex flex-col bg-black"
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 pb-2" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <p className="text-sm font-semibold text-white">Escanea el QR del marbete</p>
        <button type="button" onClick={onClose} aria-label="Cerrar escáner" className="grid size-9 place-items-center rounded-full bg-white/15 text-white"><X size={16} /></button>
      </div>
      {error ? (
        <div className="grid flex-1 place-items-center px-8 text-center text-sm font-semibold text-white/70">{error}</div>
      ) : (
        <div className="relative flex-1 overflow-hidden">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
          {/* Marco guía */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-3xl border-[3px] border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0_/_0.45)]" />
          <p className="pointer-events-none absolute inset-x-0 bottom-10 text-center text-xs font-bold text-white/80">Acerca la cámara al código pegado en el mueble</p>
        </div>
      )}
    </motion.div>
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
  // Slot sugerido: 1 si no hay conteo; con diferencia pendiente → 3; ya
  // contado → corrección del 1ro (autor/gerencia) o 2do conteo.
  const suggested = entry?.count1 === null || entry === null ? 1 : entryNeedsRecount(entry) ? 3 : 2;
  const [slot, setSlot] = useState<1 | 2 | 3>(suggested as 1 | 2 | 3);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

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
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-3 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        exit={{ y: 80 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="w-full max-w-md rounded-[26px] border border-line bg-card p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{tag.zone === "PISO" ? "Piso de venta" : "Bodega"}</p>
            <p className="text-xl font-semibold text-ink">Marbete {tag.number}{tag.label ? ` · ${tag.label}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid size-9 place-items-center rounded-full bg-slate-500/10 text-muted"><X size={16} /></button>
        </div>

        {entry?.count1 !== null && entry !== null && (
          <div className="mt-2 rounded-2xl bg-slate-500/10 px-3 py-2 text-xs font-semibold text-muted">
            1er conteo: <b className="text-ink">{entry.count1} pzas</b> · {entry.count1ByName}
            {entry.count2 !== null && <> — 2do: <b className="text-ink">{entry.count2}</b> · {entry.count2ByName}</>}
            {entry.count3 !== null && <> — 3ro: <b className="text-ink">{entry.count3}</b> · {entry.count3ByName}</>}
          </div>
        )}

        {isOpen ? (
          <>
            {entry?.count1 !== null && entry !== null && (
              <div className="mt-2.5 flex gap-1.5">
                {([1, 2, 3] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlot(s)}
                    disabled={(s === 2 && entry.count1 === null) || (s === 3 && entry.count2 === null)}
                    className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-semibold transition disabled:opacity-35 ${slot === s ? "bg-volt text-white" : "bg-slate-500/10 text-muted"}`}
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
                // Enter guarda igual que el botón (sin tener que tocarlo).
                if (event.key === "Enter" && !saving && value !== "") { event.preventDefault(); void save(); }
              }}
              inputMode="numeric"
              enterKeyHint="done"
              placeholder="0"
              aria-label={`Piezas del marbete ${tag.number}`}
              className="mt-3 min-h-16 w-full rounded-2xl border border-line bg-blue-50 px-4 text-center text-3xl font-semibold tabular-nums text-ink outline-none focus:border-volt dark:bg-[#1a2540]"
            />
            {error && <p className="mt-1.5 text-xs font-semibold text-red-500">{error}</p>}
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
    </motion.div>
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
    } finally {
      setBusy(false);
    }
  }

  async function removeNoUpc(itemId: string) {
    await fetch(`/api/conteos/${countId}/no-upc`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId })
    });
    await onChanged();
  }

  return (
    <Card className="mt-3 p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Mesa de control</p>

      {/* Inventario Kardex (teórico): la diferencia en vivo sale arriba */}
      <div className="mt-2">
        <p className="text-xs font-semibold text-ink">Inventario Kardex (teórico)</p>
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={kardex}
            onChange={(e) => setKardex(e.target.value.replace(/\D/g, "").slice(0, 7))}
            inputMode="numeric"
            placeholder="Piezas según sistema"
            aria-label="Inventario Kardex"
            disabled={!isOpen}
            className="min-w-0 flex-1 rounded-2xl border border-line bg-panel px-3 py-2 text-sm font-semibold tabular-nums text-ink outline-none focus:border-volt disabled:opacity-60"
          />
          {isOpen && (
            <button
              type="button"
              onClick={() => void saveKardex()}
              disabled={busy}
              className={`shrink-0 rounded-2xl px-4 text-sm font-semibold transition active:scale-95 disabled:opacity-50 ${kardexSaved ? "bg-emerald-500/15 text-emerald-600" : "bg-volt text-white"}`}
            >
              {kardexSaved ? "✓" : "Guardar"}
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px] font-semibold text-muted">Con el Kardex capturado, arriba verás en vivo la diferencia contra lo contado.</p>
      </div>

      {/* Piezas sin UPC */}
      <div className="mt-2">
        <p className="text-xs font-semibold text-ink">Piezas sin UPC</p>
        {count.noUpcItems.map((item) => (
          <div key={item.id} className="mt-1.5 flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-semibold text-ink">{item.concept}</span>
            <span className="font-semibold tabular-nums text-ink">{item.pieces}</span>
            {isOpen && (
              <button type="button" onClick={() => void removeNoUpc(item.id)} aria-label="Quitar" className="grid size-7 place-items-center rounded-full bg-red-500/10 text-red-500"><Trash2 size={13} /></button>
            )}
          </div>
        ))}
        {isOpen && (
          <div className="mt-2 flex gap-1.5">
            <input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Concepto" className="min-w-0 flex-1 rounded-2xl border border-line bg-panel px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-volt" />
            <input value={pieces} onChange={(e) => setPieces(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="Pzas" className="w-20 rounded-2xl border border-line bg-panel px-3 py-2 text-center text-sm font-semibold text-ink outline-none focus:border-volt" />
            <button type="button" onClick={() => void addNoUpc()} disabled={busy} aria-label="Agregar" className="grid size-10 shrink-0 place-items-center rounded-2xl bg-volt text-white transition active:scale-95 disabled:opacity-50"><Plus size={16} /></button>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-3">
        <a
          href={`/api/conteos/${countId}/export`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-600 transition active:scale-95 dark:text-blue-400"
        >
          <Download size={14} /> Mesa de control (Excel)
        </a>
        <button
          type="button"
          onClick={() => void onToggleStatus()}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition active:scale-95 ${isOpen ? "bg-slate-500/15 text-muted" : "bg-emerald-500/15 text-emerald-600"}`}
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
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500 transition active:scale-95"
        >
          <Trash2 size={14} /> Eliminar conteo (admin)
        </button>
      )}
    </Card>
  );
}
