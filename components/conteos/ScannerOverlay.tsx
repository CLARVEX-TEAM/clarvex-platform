"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Flashlight, X } from "lucide-react";
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
  const pistaRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState("");
  const [hayLinterna, setHayLinterna] = useState(false);
  const [linterna, setLinterna] = useState(false);
  const [decodificador, setDecodificador] = useState<"nativo" | "jsQR" | null>(null);
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
        /*
         * ⚠️ **Sin pedir resolución, el navegador da 640x480.** A esa medida un
         * QR de marbete visto desde medio metro ocupa unos pocos píxeles por
         * módulo y el decodificador falla o tarda varios segundos: se lee como
         * que "el escáner no sirve". Pedir 1080 es lo que más sube el acierto,
         * y es gratis.
         *
         * ⚠️ Todo va como `ideal` y NUNCA como `exact`. Un `exact` que el
         * teléfono no pueda dar lanza `OverconstrainedError` y deja SIN cámara
         * a ese aparato; con `ideal` se acerca a lo que pueda y sigue.
         */
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            // `focusMode` no está en los tipos estándar; en Android sí existe y
            // es lo que evita la foto borrosa al acercar la cámara al mueble.
            advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet]
          }
        });
      } catch {
        setError("Sin acceso a la cámara. Da permiso o captura desde la lista.");
        return;
      }
      if (cancelled || !videoRef.current) return;
      pistaRef.current = stream.getVideoTracks()[0] ?? null;
      const capacidades = pistaRef.current?.getCapabilities?.() as { torch?: boolean } | undefined;
      setHayLinterna(Boolean(capacidades?.torch));
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
        setDecodificador("nativo");
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
        //
        // ⚠️ Si esto sale en un ANDROID, es que el WebView de ese teléfono no
        // trae la Shape Detection API, y entonces la precisión que se nota es
        // la de jsQR y no la del sistema. Se enseña en pantalla porque desde
        // fuera los dos caminos se ven idénticos: la cámara se abre igual.
        setDecodificador("jsQR");
        const { default: jsQR } = await import("jsqr");
        if (cancelled) return;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        interval = setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2 || !context) return;
          // ⚠️ Estaba en 480 px y ahí un QR pequeño se pierde: jsQR necesita
          // varios píxeles por módulo. 960 sigue decodificando de sobra dentro
          // del intervalo de 300 ms y dobla el alcance útil.
          const scale = Math.min(1, 960 / (video.videoWidth || 960));
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

  /**
   * ⚠️ **La linterna no se enciende sola.** Ilumina de verdad y arranca en la
   * cara de quien tenga enfrente; además gasta batería en un turno entero. Se
   * ofrece y decide la persona.
   */
  const alternarLinterna = useCallback(async () => {
    const pista = pistaRef.current;
    if (!pista) return;
    const encender = !linterna;
    try {
      await pista.applyConstraints({
        advanced: [{ torch: encender } as unknown as MediaTrackConstraintSet]
      });
      setLinterna(encender);
    } catch {
      // El teléfono dijo que podía y no pudo: se retira el botón en vez de
      // dejarlo ahí sin hacer nada.
      setHayLinterna(false);
    }
  }, [linterna]);

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
      {/* `env(safe-area-inset-top)` vale CERO dentro del WebView de Android: el
          título quedaba bajo el reloj. Se usa la variable que rellena la app. */}
      <div className="flex items-center justify-between gap-2 px-4 pb-2" style={{ paddingTop: "calc(var(--safe-top) + 12px)" }}>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">Escanea el QR del marbete</p>
        {hayLinterna && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void alternarLinterna(); }}
            aria-label={linterna ? "Apagar la linterna" : "Encender la linterna"}
            aria-pressed={linterna}
            className={`grid size-9 shrink-0 place-items-center rounded-full ${linterna ? "bg-white text-black" : "bg-white/15 text-white"}`}
          >
            <Flashlight size={16} />
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Cerrar escáner" className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-white"><X size={16} /></button>
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
          {/* Para saber POR QUÉ falla cuando falle: los dos decodificadores
              abren la cámara igual y desde fuera no se distinguen. */}
          {decodificador && (
            <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-[10px] font-semibold text-white/35">
              lector {decodificador}
            </p>
          )}
        </div>
      )}
    </motion.div>,
    document.body
  );
}
