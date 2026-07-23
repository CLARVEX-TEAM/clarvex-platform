"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Intro cinematográfico de apertura (~2.4 s) al estilo SaaS premium
 * (Stripe / Revolut / Linear). El splash NATIVO de la PWA/iOS es una imagen
 * estática y no se puede animar, así que en cuanto la app carga corremos este
 * intro y luego se funde a la app. Se muestra una vez por sesión.
 *
 * Escenas:
 *  1 (0–0.35s)  punto azul pulsante donde nacerá el logo.
 *  2 (0.35–1.3s) el logo se "construye": máscara que lo revela desde la esquina
 *                superior-izquierda + punto láser con glow (respeta el logo real).
 *  3 (1.3–1.7s)  onda azul detrás, barrido de luz diagonal y escala 95→102→100.
 *  4 (1.7–2.3s)  CLARVEX TEAM + subtítulo + línea de carga, y fundido a la app.
 */

const EASE = [0.22, 1, 0.36, 1] as const;
const LOGO = 132; // px

export function SplashIntro() {
  const [show, setShow] = useState(false);
  const reduce = useReducedMotion();

  const particles = useMemo(
    () => Array.from({ length: 10 }, (_, i) => ({
      id: i,
      left: `${8 + Math.random() * 84}%`,
      top: `${12 + Math.random() * 76}%`,
      size: 2 + Math.random() * 2,
      delay: Math.random() * 1.2,
      drift: 10 + Math.random() * 20
    })),
    []
  );

  useEffect(() => {
    try {
      if (sessionStorage.getItem("clarvex-splash")) return;
      sessionStorage.setItem("clarvex-splash", "1");
    } catch { /* sin sessionStorage: se muestra igual */ }
    setShow(true);
    const timer = setTimeout(() => setShow(false), reduce ? 900 : 2450);
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
          {/* Gradiente azul sutil, en movimiento lento */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(90% 70% at 50% 42%, rgba(37,86,190,.20), transparent 70%)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: reduce ? 0.6 : [0.15, 0.6, 0.4] }}
            transition={{ duration: 2.4, ease: "easeInOut" }}
          />

          {/* Partículas casi invisibles */}
          {!reduce && particles.map((p) => (
            <motion.span
              key={p.id}
              aria-hidden
              className="pointer-events-none absolute rounded-full"
              style={{ left: p.left, top: p.top, width: p.size, height: p.size, background: "rgba(140,180,255,.9)" }}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 0.5, 0], y: -p.drift }}
              transition={{ duration: 2.2, delay: p.delay, ease: "easeInOut" }}
            />
          ))}

          <div className="relative flex flex-col items-center">
            {/* Zona del logo */}
            <div className="relative" style={{ width: LOGO, height: LOGO }}>
              {/* Escena 1: punto azul pulsante (se desvanece al empezar el trazo) */}
              {!reduce && (
                <motion.span
                  aria-hidden
                  className="absolute rounded-full"
                  style={{ left: "30%", top: "26%", width: 12, height: 12, background: "#4C8CFF", boxShadow: "0 0 18px 6px rgba(76,140,255,.85)" }}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: [0, 1, 0.9, 0], scale: [0.6, 1.15, 1, 0.9] }}
                  transition={{ duration: 0.55, times: [0, 0.4, 0.7, 1], ease: "easeInOut" }}
                />
              )}

              {/* Onda azul que se expande detrás (Escena 3) */}
              {!reduce && (
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-[30px]"
                  style={{ background: "radial-gradient(circle, rgba(76,140,255,.55), transparent 70%)", filter: "blur(14px)" }}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: [0, 0.9, 0.45], scale: [0.5, 1.5, 1.7] }}
                  transition={{ duration: 0.7, delay: 1.3, ease: "easeOut" }}
                />
              )}

              {/* Logo real, con escala de confianza (Escena 3) */}
              <motion.div
                className="relative size-full overflow-hidden rounded-[28px] shadow-2xl"
                initial={{ scale: reduce ? 1 : 0.95 }}
                animate={{ scale: reduce ? 1 : [0.95, 0.95, 1.02, 1] }}
                transition={{ duration: 1.7, times: [0, 0.76, 0.9, 1], ease: EASE }}
              >
                <motion.img
                  src="/icon-512.png"
                  alt="Clarvex"
                  width={LOGO}
                  height={LOGO}
                  className="size-full"
                  initial={{ clipPath: reduce ? "circle(150% at 50% 50%)" : "circle(0% at 32% 28%)" }}
                  animate={{ clipPath: "circle(150% at 32% 28%)" }}
                  transition={{ duration: reduce ? 0.3 : 0.95, delay: reduce ? 0 : 0.35, ease: EASE }}
                />

                {/* Barrido de luz diagonal (Apple-style), recortado al logo */}
                {!reduce && (
                  <motion.div
                    aria-hidden
                    className="absolute inset-y-0 w-1/2"
                    style={{ background: "linear-gradient(105deg, transparent, rgba(255,255,255,.55), transparent)", filter: "blur(2px)" }}
                    initial={{ x: "-160%" }}
                    animate={{ x: "260%" }}
                    transition={{ duration: 0.6, delay: 1.4, ease: "easeInOut" }}
                  />
                )}
              </motion.div>

              {/* Punto láser que "construye" el logo (Escena 2) */}
              {!reduce && (
                <motion.span
                  aria-hidden
                  className="absolute rounded-full"
                  style={{ width: 10, height: 10, background: "#EAF2FF", boxShadow: "0 0 16px 5px rgba(120,170,255,.95)" }}
                  initial={{ opacity: 0, left: "30%", top: "24%" }}
                  animate={{ opacity: [0, 1, 1, 0], left: ["30%", "70%", "44%", "58%"], top: ["24%", "40%", "74%", "88%"] }}
                  transition={{ duration: 0.95, delay: 0.35, times: [0, 0.25, 0.75, 1], ease: EASE }}
                />
              )}
            </div>

            {/* Escena 4: texto */}
            <motion.div
              className="mt-6 text-[20px] font-bold text-white"
              style={{ letterSpacing: "0.34em" }}
              initial={{ opacity: 0, y: reduce ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: reduce ? 0.1 : 1.72, ease: EASE }}
            >
              CLARVEX TEAM
            </motion.div>

            <motion.div
              className="mt-2 text-[12px] font-medium text-white/85"
              style={{ letterSpacing: "0.05em" }}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 0.85, y: 0 }}
              transition={{ duration: 0.5, delay: reduce ? 0.15 : 1.9, ease: EASE }}
            >
              Retail Intelligence Platform
            </motion.div>

            {/* Línea de carga azul, una pasada de izquierda a derecha */}
            <div className="mt-5 h-[2px] w-36 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, transparent, #3B7BFF, #7FB0FF)" }}
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: reduce ? 0.5 : 0.75, delay: reduce ? 0.2 : 1.95, ease: EASE }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
