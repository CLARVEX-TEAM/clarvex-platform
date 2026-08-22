"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Fingerprint, Globe2, Sparkles, X } from "lucide-react";
import { AnimatedBeam } from "@/components/magic/AnimatedBeam";
import { Marquee } from "@/components/magic/Marquee";

/**
 * Aviso temporal de la migración de dominio.
 *
 * Solo vive en el dominio que será retirado. El servidor nuevo todavía es una
 * copia de transición y recibirá un volcado final en el corte, por lo que la
 * banda informa el cambio sin convertir el dominio nuevo en un CTA operativo.
 */
const DISMISS_KEY = "clarvex-domain-banner-dismissed";
const NEW_DOMAIN = "team.clarvex.tech";
const OLD_DOMAINS = ["app.adrianluna.mx"];

function MarqueeMessage() {
  return (
    <div className="flex shrink-0 items-center gap-3 px-4 text-[13px] font-semibold text-white sm:px-6 sm:text-sm">
      <span className="inline-flex items-center gap-1.5">
        <Sparkles size={14} className="text-blue-100" />
        Próximamente Clarvex tendrá un nuevo hogar
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-[rgb(255_255_255_/_0.12)] px-2 py-0.5 font-black tracking-[0.01em]">
        <Globe2 size={13} />
        {NEW_DOMAIN}
      </span>
      <span className="inline-flex items-center gap-1.5 text-blue-100">
        <Fingerprint size={14} />
        Al cambiar, registrarás tu huella una vez más
      </span>
      <span className="text-white/40" aria-hidden="true">•</span>
    </div>
  );
}

export function DomainMoveBanner() {
  const [visible, setVisible] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // Si el navegador bloquea sessionStorage, el aviso puede mostrarse.
    }

    const isLocalPreview =
      process.env.NODE_ENV !== "production" &&
      new URLSearchParams(window.location.search).has("previewDomainMove");

    if (OLD_DOMAINS.includes(window.location.hostname) || isLocalPreview) setVisible(true);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Sin almacenamiento, reaparecerá en la siguiente navegación completa.
    }
  }

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.aside
          aria-label="Aviso de cambio de dominio"
          initial={reduceMotion ? false : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="desk-adopt relative z-[200] w-full bg-[#1D4ED8] text-white shadow-[0_6px_18px_rgb(29_78_216_/_0.18)]"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <p className="sr-only">
            Próximamente Clarvex se mudará a {NEW_DOMAIN}. Por ahora continúa usando este sitio. En el nuevo dominio tendrás que registrar tu huella una vez más desde Mi perfil.
          </p>

          <div className="flex min-h-11 items-center">
            <div aria-hidden="true" className="relative min-w-0 flex-1">
              <Marquee className="py-2.5" durationSec={24}>
                <MarqueeMessage />
                <MarqueeMessage />
                <MarqueeMessage />
              </Marquee>
              <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#1D4ED8] to-transparent sm:w-12" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#1D4ED8] to-transparent sm:w-12" />
            </div>

            <button
              type="button"
              onClick={dismiss}
              aria-label="Ocultar aviso de cambio de dominio"
              className="tappable mr-1 grid size-11 shrink-0 place-items-center rounded-xl text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-white"
            >
              <X size={17} />
            </button>
          </div>

          <AnimatedBeam />
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
