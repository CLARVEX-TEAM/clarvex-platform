"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { parseTagQr } from "@/lib/cycle-count";

// Escaneo del QR del marbete. Vive aparte porque lo usan el conteo fisico y el
// conteo diario de una seccion.

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export function ScannerOverlay({ onScan, onClose }: { onScan: (number: number) => void; onClose: () => void }) {
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

  // Mismo motivo que la hoja de captura: dentro de `AppFrame` el `fixed` queda
  // encerrado por su transform y la barra inferior se pinta encima.
  if (typeof document === "undefined") return null;

  return createPortal(
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
    </motion.div>,
    document.body
  );
}
