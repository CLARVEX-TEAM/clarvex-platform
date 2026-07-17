"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ImageDown, Loader2, X } from "lucide-react";
import { whiten } from "@/lib/doc-enhance";
import { warpDocument, type Point } from "@/lib/doc-warp";

const WORK_MAX = 1400; // resolución de trabajo (arrastre + procesado)

type Work = { imageData: ImageData; url: string; w: number; h: number };

function imageDataToBlob(image: ImageData): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.putImageData(image, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
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
      setWork({ imageData: ctx.getImageData(0, 0, w, h), url: dataUrl, w, h });
      // Esquinas iniciales: un margen del 8% (la foto suele encuadrar el documento).
      const mx = w * 0.08, my = h * 0.08;
      setCorners([
        { x: mx, y: my }, { x: w - mx, y: my }, { x: w - mx, y: h - my }, { x: mx, y: h - my }
      ]);
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
      const image = cropped ? warpDocument(work.imageData, corners) : work.imageData;
      whiten(image);
      const blob = await imageDataToBlob(image);
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
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-sm font-bold"><X size={18} />Cancelar</button>
        <p className="text-sm font-black">Ajusta las esquinas</p>
        <span className="w-20" />
      </div>

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
                className="absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-volt bg-white/90 shadow-lg"
                style={{ left: `${(corner.x / work.w) * 100}%`, top: `${(corner.y / work.h) * 100}%` }}
              >
                <span className="size-2 rounded-full bg-volt" />
              </button>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm font-semibold text-white/80"><Loader2 size={16} className="animate-spin" />Cargando…</p>
        )}
      </div>

      {error ? <p className="px-4 pb-1 text-center text-xs font-semibold text-rose-300">{error}</p> : null}

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
