"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CLARVEX_C_PATH } from "@/components/ClarvexIcon";

/**
 * Intro cinematográfico de apertura (~2.4 s), estilo SaaS premium (Stripe /
 * Revolut / Linear). El splash NATIVO de la PWA/iOS es una imagen estática; en
 * cuanto la app carga corremos este intro y se funde a la app. Una vez por sesión.
 *
 * El logo es VECTOR REAL (la "C" vectorizada del logo oficial, sin redibujarla):
 *  1 (0–0.35s)  punto azul pulsante donde nace el trazo.
 *  2 (0.35–1.3s) un láser TRAZA EL CONTORNO EXACTO de la C (stroke que se dibuja).
 *  3 (1.3–1.7s)  se rellena la C, aparece el cuadro azul detrás, barrido de luz
 *                Apple-style y escala 95→102→100.
 *  4 (1.7–2.3s)  CLARVEX TEAM + subtítulo + línea de carga, y fundido a la app.
 */

const EASE = [0.22, 1, 0.36, 1] as const;
const LOGO = 140; // px

// El contorno de la "C" vive en components/ClarvexIcon: lo comparten el splash
// y el icono de marca, así el logo no puede quedar desincronizado entre
// pantallas — que es justo lo que había pasado con el acceso.
const C_PATH = CLARVEX_C_PATH;

export function SplashIntro() {
  const [show, setShow] = useState(false);
  const reduce = useReducedMotion();

  const particles = useMemo(
    () => Array.from({ length: 10 }, (_, i) => ({
      id: i, left: `${8 + Math.random() * 84}%`, top: `${12 + Math.random() * 76}%`,
      size: 2 + Math.random() * 2, delay: Math.random() * 1.2, drift: 10 + Math.random() * 20
    })),
    []
  );

  useEffect(() => {
    // App nativa (Capacitor/Android): oculta el splash NATIVO justo cuando la app
    // web ya montó, para que el intro se vea completo SIN parpadeo del ícono. En
    // web/PWA es no-op (el plugin no hace nada fuera de la app nativa).
    void import("@capacitor/splash-screen")
      .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 250 }))
      .catch(() => undefined);
    try {
      if (sessionStorage.getItem("clarvex-splash")) return;
      sessionStorage.setItem("clarvex-splash", "1");
    } catch { /* sin sessionStorage: se muestra igual */ }
    setShow(true);
    const timer = setTimeout(() => setShow(false), reduce ? 900 : 2500);
    return () => clearTimeout(timer);
  }, [reduce]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.45, ease: "easeInOut" } }}
          className="fixed inset-0 z-[9999] grid place-items-center overflow-hidden"
          style={{ backgroundColor: "#0B1220" }}
        >
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(90% 70% at 50% 42%, rgba(37,86,190,.20), transparent 70%)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: reduce ? 0.6 : [0.15, 0.6, 0.4] }}
            transition={{ duration: 2.4, ease: "easeInOut" }}
          />

          {!reduce && particles.map((p) => (
            <motion.span
              key={p.id} aria-hidden className="pointer-events-none absolute rounded-full"
              style={{ left: p.left, top: p.top, width: p.size, height: p.size, background: "rgba(140,180,255,.9)" }}
              initial={{ opacity: 0, y: 0 }} animate={{ opacity: [0, 0.5, 0], y: -p.drift }}
              transition={{ duration: 2.2, delay: p.delay, ease: "easeInOut" }}
            />
          ))}

          <div className="relative flex flex-col items-center">
            <motion.div
              style={{ width: LOGO, height: LOGO }}
              initial={{ scale: reduce ? 1 : 0.95 }}
              animate={{ scale: reduce ? 1 : [0.95, 0.95, 1.02, 1] }}
              transition={{ duration: 1.7, times: [0, 0.76, 0.9, 1], ease: EASE }}
            >
              <svg viewBox="0 0 512 512" width={LOGO} height={LOGO} className="drop-shadow-2xl">
                <defs>
                  <linearGradient id="cx-blue" x1="1" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#3f7dff" />
                    <stop offset="1" stopColor="#15316e" />
                  </linearGradient>
                  <linearGradient id="cx-sweep" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#fff" stopOpacity="0" />
                    <stop offset="0.5" stopColor="#fff" stopOpacity="0.5" />
                    <stop offset="1" stopColor="#fff" stopOpacity="0" />
                  </linearGradient>
                  <clipPath id="cx-sq"><rect x="0" y="0" width="512" height="512" rx="112" /></clipPath>
                  <filter id="cx-glow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="6" result="b" />
                    <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>

                {/* Escena 3: cuadro azul del logo, aparece detrás de la C */}
                <motion.rect
                  x="0" y="0" width="512" height="512" rx="112" fill="url(#cx-blue)"
                  initial={{ opacity: reduce ? 1 : 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reduce ? 0.3 : 0.45, delay: reduce ? 0 : 1.3, ease: EASE }}
                />

                {/* Escena 2: el láser TRAZA el contorno exacto de la C */}
                {!reduce && (
                  <motion.path
                    d={C_PATH} fill="none" stroke="#EAF2FF" strokeWidth="7"
                    strokeLinecap="round" strokeLinejoin="round" filter="url(#cx-glow)"
                    initial={{ pathLength: 0, opacity: 1 }}
                    animate={{ pathLength: 1, opacity: [1, 1, 0] }}
                    transition={{
                      pathLength: { duration: 0.95, delay: 0.35, ease: EASE },
                      opacity: { duration: 0.5, delay: 1.45, ease: "easeInOut" }
                    }}
                  />
                )}

                {/* Escena 3: la C rellena en blanco */}
                <motion.path
                  d={C_PATH} fill="#ffffff" fillRule="evenodd"
                  initial={{ opacity: reduce ? 1 : 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reduce ? 0.3 : 0.4, delay: reduce ? 0 : 1.32, ease: EASE }}
                />

                {/* Escena 3: barrido de luz diagonal recortado al cuadro */}
                {!reduce && (
                  <g clipPath="url(#cx-sq)">
                    <motion.rect
                      y="-80" width="150" height="672" fill="url(#cx-sweep)" transform="skewX(-16)"
                      initial={{ x: -300, opacity: 0 }}
                      animate={{ x: 640, opacity: [0, 1, 0] }}
                      transition={{ duration: 0.7, delay: 1.45, ease: "easeInOut" }}
                    />
                  </g>
                )}

                {/* Escena 1: punto azul pulsante donde nace el trazo */}
                {!reduce && (
                  <motion.circle
                    cx="256" cy="88" r="9" fill="#4C8CFF"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: [0, 1, 0.9, 0], scale: [0.6, 1.2, 1, 0.8] }}
                    transition={{ duration: 0.6, times: [0, 0.4, 0.7, 1], ease: "easeInOut" }}
                    style={{ filter: "drop-shadow(0 0 10px rgba(76,140,255,.9))", transformOrigin: "256px 88px" }}
                  />
                )}
              </svg>
            </motion.div>

            {/* Escena 4: texto */}
            <motion.div
              className="mt-6 text-[20px] font-bold text-white" style={{ letterSpacing: "0.34em" }}
              initial={{ opacity: 0, y: reduce ? 0 : 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: reduce ? 0.1 : 1.74, ease: EASE }}
            >
              CLARVEX TEAM
            </motion.div>
            <motion.div
              className="mt-2 text-[12px] font-medium text-white/85" style={{ letterSpacing: "0.05em" }}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 0.85, y: 0 }}
              transition={{ duration: 0.5, delay: reduce ? 0.15 : 1.9, ease: EASE }}
            >
              Retail Intelligence Platform
            </motion.div>
            <div className="mt-5 h-[2px] w-36 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full" style={{ background: "linear-gradient(90deg, transparent, #3B7BFF, #7FB0FF)" }}
                initial={{ width: "0%" }} animate={{ width: "100%" }}
                transition={{ duration: reduce ? 0.5 : 0.75, delay: reduce ? 0.2 : 1.95, ease: EASE }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
