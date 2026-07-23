"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Intro animado de apertura. El splash NATIVO de la PWA/iOS (imagen estática con
 * el ícono) no se puede animar, así que en cuanto la app carga mostramos este
 * intro por ~1.5 s y luego se desvanece para revelar la app. Se muestra una vez
 * por sesión (no en cada navegación ni recarga).
 */
export function SplashIntro() {
  const [show, setShow] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    try {
      if (sessionStorage.getItem("clarvex-splash")) return;
      sessionStorage.setItem("clarvex-splash", "1");
    } catch { /* sin sessionStorage: se muestra igual */ }
    setShow(true);
    const timer = setTimeout(() => setShow(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: reduce ? 1 : 1.05, transition: { duration: 0.5, ease: "easeInOut" } }}
          className="fixed inset-0 z-[9999] grid place-items-center overflow-hidden"
          style={{ background: "radial-gradient(120% 120% at 50% 42%, #15234a 0%, #0b1220 58%, #070a11 100%)" }}
        >
          {!reduce && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute size-[340px] rounded-full"
              style={{ background: "radial-gradient(circle, rgba(70,124,255,.38), transparent 70%)", filter: "blur(34px)" }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: [0, 0.85, 0.55], scale: [0.6, 1.12, 1] }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
            />
          )}

          <div className="relative flex flex-col items-center">
            <motion.img
              src="/icon-512.png"
              alt="Clarvex"
              width={108}
              height={108}
              className="rounded-[28px] shadow-2xl"
              initial={{ opacity: 0, scale: reduce ? 1 : 0.68, y: reduce ? 0 : 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={reduce ? { duration: 0.3 } : { type: "spring", stiffness: 210, damping: 17, delay: 0.05 }}
            />

            <motion.div
              className="mt-5 text-[22px] font-semibold text-white"
              initial={{ opacity: 0, y: reduce ? 0 : 10, letterSpacing: reduce ? "0.35em" : "0.62em" }}
              animate={{ opacity: 1, y: 0, letterSpacing: "0.35em" }}
              transition={{ duration: 0.6, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              CLARVEX
            </motion.div>

            <motion.div
              className="mt-4 h-[3px] w-24 overflow-hidden rounded-full bg-white/12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {!reduce && (
                <motion.div
                  className="h-full w-1/2 rounded-full"
                  style={{ background: "linear-gradient(90deg, transparent, #3B7BFF, transparent)" }}
                  initial={{ x: "-120%" }}
                  animate={{ x: "240%" }}
                  transition={{ duration: 1, ease: "easeInOut", repeat: Infinity }}
                />
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
