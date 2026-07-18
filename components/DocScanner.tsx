"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ImageDown, Loader2, RotateCcw, X } from "lucide-react";
import { detectDocumentCorners } from "@/lib/doc-detect";
import { whiten } from "@/lib/doc-enhance";
import { warpDocument, type Point } from "@/lib/doc-warp";

const WORK_MAX = 1400;   // resolución de la PREVIEW (arrastre de esquinas fluido)
const PROCESS_MAX = 2400; // resolución de SALIDA (para que corte/vouchers sean legibles)

type Work = { imageData: ImageData; url: string; w: number; h: number };

function imageDataToBlob(image: ImageData, quality = 0.92): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.putImageData(image, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Decodifica la foto ORIGINAL a máxima resolución (acotada a `max`). El recorte y
 * el blanqueado se hacen sobre ESTA imagen, no sobre la preview de 1400 px, para
 * no perder detalle del documento.
 */
function loadHiRes(file: File, max: number): Promise<{ imageData: ImageData; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      URL.revokeObjectURL(url);
      if (!ctx) { reject(new Error("sin canvas")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ imageData: ctx.getImageData(0, 0, w, h), w, h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("no se pudo leer")); };
    img.src = url;
  });
}

/**
 * Esquinas iniciales: las detectadas automáticamente o, si no hay una región
 * clara, un recuadro con margen del 8% para ajustar a mano.
 */
function autoCorners(imageData: ImageData, w: number, h: number): Point[] {
  const detected = detectDocumentCorners(imageData);
  if (detected) return detected;
  const mx = w * 0.08, my = h * 0.08;
  return [{ x: mx, y: my }, { x: w - mx, y: my }, { x: w - mx, y: h - my }, { x: mx, y: h - my }];
}

/**
 * Recorte tipo CamScanner: se muestra la foto con 4 esquinas arrastrables; al
 * confirmar, se endereza el documento y se blanquea el fondo. También deja usar la
 * foto completa (solo blanqueada) por si un documento no conviene recortarlo.
 */
export function DocScanner({ file, onDone, onCancel }: { file: File; onDone: (blob: Blob) => void; onCancel: () => void }) {
  const [work, setWork] = useState<Work | null>(null);
  const [corners, setCorners] = useState<Point[]>([]); // TL, TR, BR, BL en coords de trabajo
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // B/N (documento realzado, ideal para tickets) vs Color (la foto tal cual, en alta).
  const [color, setColor] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, WORK_MAX / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) { setError("No se pudo procesar la imagen."); URL.revokeObjectURL(url); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      revoke = url;
      URL.revokeObjectURL(url);
      const imageData = ctx.getImageData(0, 0, w, h);
      setWork({ imageData, url: dataUrl, w, h });
      setCorners(autoCorners(imageData, w, h));
    };
    img.onerror = () => { setError("No se pudo leer la imagen."); URL.revokeObjectURL(url); };
    img.src = url;
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [file]);

  function moveCorner(clientX: number, clientY: number) {
    const box = boxRef.current;
    const index = dragging.current;
    if (!box || index === null || !work) return;
    const rect = box.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * work.w;
    const y = ((clientY - rect.top) / rect.height) * work.h;
    setCorners((current) => current.map((corner, i) => i === index
      ? { x: Math.max(0, Math.min(work.w, x)), y: Math.max(0, Math.min(work.h, y)) }
      : corner));
  }

  async function finish(cropped: boolean) {
    if (!work) return;
    setBusy(true);
    setError("");
    try {
      // Se procesa sobre la foto ORIGINAL en alta resolución. Las esquinas se
      // ajustaron en la preview (1400 px) → se escalan al tamaño real.
      const hi = await loadHiRes(file, PROCESS_MAX);
      const sx = hi.w / work.w;
      const sy = hi.h / work.h;
      const hiCorners = corners.map((c) => ({ x: c.x * sx, y: c.y * sy }));
      const image = cropped ? warpDocument(hi.imageData, hiCorners, PROCESS_MAX) : hi.imageData;
      if (!color) whiten(image); // en Color se deja la foto tal cual, solo enderezada
      const blob = await imageDataToBlob(image, 0.92);
      if (!blob) throw new Error("No se pudo generar la imagen.");
      onDone(blob);
    } catch {
      setError("No se pudo procesar el documento. Prueba con la foto completa.");
      setBusy(false);
    }
  }

  const polygon = work && corners.length === 4
    ? corners.map((c) => `${(c.x / work.w) * 100},${(c.y / work.h) * 100}`).join(" ")
    : "";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 pb-1 pt-3 text-white">
        <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-sm font-bold"><X size={18} />Cancelar</button>
        <p className="text-sm font-black">Revisa el recorte</p>
        <button
          type="button"
          onClick={() => { if (work) setCorners(autoCorners(work.imageData, work.w, work.h)); }}
          disabled={!work}
          className="flex items-center gap-1 text-xs font-bold text-white/80 disabled:opacity-40"
        >
          <RotateCcw size={14} />Reajustar
        </button>
      </div>
      <p className="px-4 pb-2 text-center text-xs text-white/60">Arrastra las esquinas a las orillas del documento</p>

      <div className="flex flex-1 items-center justify-center overflow-hidden px-3">
        {work ? (
          <div
            ref={boxRef}
            className="relative touch-none select-none"
            style={{ maxWidth: "100%", maxHeight: "100%", aspectRatio: `${work.w} / ${work.h}` }}
            onPointerMove={(event) => { if (dragging.current !== null) { event.preventDefault(); moveCorner(event.clientX, event.clientY); } }}
            onPointerUp={() => { dragging.current = null; }}
            onPointerLeave={() => { dragging.current = null; }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={work.url} alt="Documento" className="block h-full w-full object-contain" draggable={false} />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
              <polygon points={polygon} fill="rgba(37,99,235,0.15)" stroke="#2563EB" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            </svg>
            {corners.map((corner, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Esquina ${i + 1}`}
                onPointerDown={(event) => { event.preventDefault(); dragging.current = i; event.currentTarget.setPointerCapture(event.pointerId); }}
                className="absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-white bg-volt/40 shadow-lg backdrop-blur-[1px] active:scale-110"
                style={{ left: `${(corner.x / work.w) * 100}%`, top: `${(corner.y / work.h) * 100}%` }}
              >
                <span className="size-2.5 rounded-full bg-white" />
              </button>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm font-semibold text-white/80"><Loader2 size={16} className="animate-spin" />Cargando…</p>
        )}
      </div>

      {error ? <p className="px-4 pb-1 text-center text-xs font-semibold text-rose-300">{error}</p> : null}

      <div className="flex justify-center px-4 pt-1">
        <div className="inline-flex rounded-full border border-white/20 p-0.5 text-xs font-black">
          <button type="button" onClick={() => setColor(false)} className={`rounded-full px-4 py-1.5 transition ${!color ? "bg-white text-black" : "text-white/70"}`}>
            Blanco y negro
          </button>
          <button type="button" onClick={() => setColor(true)} className={`rounded-full px-4 py-1.5 transition ${color ? "bg-white text-black" : "text-white/70"}`}>
            Color
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-4">
        <button type="button" onClick={() => void finish(false)} disabled={busy || !work} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-white/25 py-3 text-sm font-black text-white disabled:opacity-50">
          <ImageDown size={16} />Foto completa
        </button>
        <button type="button" onClick={() => void finish(true)} disabled={busy || !work} className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-2xl bg-volt py-3 text-sm font-black text-white disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{busy ? "Procesando…" : "Extraer documento"}
        </button>
      </div>
    </div>
  );
}
