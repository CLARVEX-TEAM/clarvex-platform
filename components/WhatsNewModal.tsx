"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  Database,
  FileSpreadsheet,
  Handshake,
  ShieldCheck,
  X
} from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";

/**
 * Anuncio de reapertura de agosto de 2026.
 *
 * Una clave nueva hace que el aviso se muestre una vez a cada persona. El CTA
 * de Retool se deriva de la sesión de Clarvex: nunca se enseña a asesores ni al
 * usuario kiosko, aunque alguien conserve una URL directa en el navegador.
 */
const RELEASE_KEY = "clarvex-whatsnew-2026-08-captura-propia";
const CAPTURE_URL = "https://captura.adrianluna.mx/rr/app/captura-clarvex";
const EXCLUDED_PATHS = ["/login", "/mantenimiento", "/checklist", "/suspendida"];

function canOpenCapture(user: User): boolean {
  return !user.checklistOnly && (user.role === "GERENTE" || user.role === "SUBGERENTE");
}

function isExcludedPath(pathname: string): boolean {
  return pathname === "/" || EXCLUDED_PATHS.some((path) => pathname.startsWith(path));
}

export function WhatsNewModal() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [captureAccess, setCaptureAccess] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    if (isExcludedPath(pathname)) {
      setOpen(false);
      return () => { cancelled = true; };
    }

    try {
      if (localStorage.getItem(RELEASE_KEY)) return () => { cancelled = true; };
    } catch {
      // Sin almacenamiento local el aviso sigue siendo seguro; solo podría
      // volver a aparecer en una visita posterior.
    }

    getSession()
      .then((user) => {
        if (!user || cancelled) return;

        /*
         * ⚠️ **La sesión de DEMO nunca ve este aviso.**
         *
         * Es un comunicado interno —habla de Grupo Axo, de Retool y de una
         * transición temporal— y era **lo primero** que aparecía al abrir la
         * demo, tapando el panel entero. Quien entra desde fuera a ver el
         * producto se encontraba con la política interna de una tienda.
         *
         * No es hipotético: Cloudflare revisó la demo en septiembre de 2026 y
         * concluyó que los enlaces «llevan a un login», sin ver la aplicación.
         */
        if (user.demo) return;

        setCaptureAccess(canOpenCapture(user));
        setOpen(true);
      })
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, [pathname]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(RELEASE_KEY, "1");
    } catch {
      /* El cierre de esta vista no depende de localStorage. */
    }
    setOpen(false);
  }, []);

  const openCapture = useCallback(() => {
    dismiss();
    window.location.assign(CAPTURE_URL);
  }, [dismiss]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, dismiss]);

  const panel = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 24, scale: 0.985 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 16, scale: 0.985 }
      };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={dismiss}
          role="dialog"
          aria-modal="true"
          aria-labelledby="whatsnew-title"
          aria-describedby="whatsnew-description"
        >
          <motion.div
            onClick={(event) => event.stopPropagation()}
            {...panel}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="desk-adopt flex max-h-[94dvh] w-full max-w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-card shadow-2xl sm:max-h-[88vh] sm:max-w-2xl sm:rounded-3xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-7 sm:py-5">
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-volt">
                  Una nueva etapa
                </p>
                <h2 id="whatsnew-title" className="text-xl font-semibold tracking-[-0.025em] text-ink sm:text-2xl">
                  Clarvex vuelve con captura propia
                </h2>
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Cerrar anuncio"
                className="-mr-1.5 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-muted transition hover:bg-line/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt"
              >
                <X size={19} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6 [scrollbar-width:thin]">
              <p id="whatsnew-description" className="max-w-2xl text-[14px] leading-6 text-muted sm:text-[15px]">
                Durante estos días construimos una base propia para que la operación de cada tienda ya no dependa de enlaces de Excel externos.
              </p>

              <div className="mt-5 rounded-2xl border border-volt/25 bg-volt/[0.07] p-4 sm:p-5">
                <div className="flex items-start gap-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-volt text-white">
                    <Handshake size={20} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-ink sm:text-base">
                      Retool se integra a Clarvex
                    </h3>
                    <p className="mt-1 text-[13px] leading-5 text-muted sm:text-sm sm:leading-6">
                      A través de su programa para startups, Retool confió en nuestro proyecto y nos dio acceso a la plataforma segura donde gerentes y subgerentes capturarán horarios, asistencia, KPIs, tráfico y descuentos. Cada acceso está ligado únicamente a su tienda.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-0 sm:grid-cols-2 sm:gap-x-7">
                <div className="flex items-start gap-3.5 border-b border-line/70 py-4 sm:border-b-0 sm:border-r sm:pr-7">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-line/50 text-ink">
                    <Database size={17} />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Por qué hicimos el cambio</h3>
                    <p className="mt-1 text-[12.5px] leading-5 text-muted">
                      Grupo Axo modificó el acceso a los archivos compartidos que alimentaban Clarvex. Para mantener la continuidad, construimos una ruta que controlamos nosotros.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 py-4 sm:pl-0">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-line/50 text-ink">
                    <FileSpreadsheet size={17} />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Una transición temporal</h3>
                    <p className="mt-1 text-[12.5px] leading-5 text-muted">
                      Sabemos que por ahora implica capturar tanto en los archivos de Axo como en la nueva plataforma. Seguimos trabajando para colaborar directamente con Grupo Axo y eliminar esa duplicidad.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-1 flex items-start gap-3 rounded-xl bg-line/35 px-4 py-3.5">
                <ShieldCheck className="mt-0.5 shrink-0 text-volt" size={18} />
                <p className="text-[12.5px] leading-5 text-muted">
                  Gracias por su confianza y por sostener la operación durante esta transición. Clarvex seguirá facilitando el control individual, el seguimiento del equipo y las decisiones de cada tienda.
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2.5 border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-7 sm:pb-4">
              {captureAccess ? (
                <button
                  type="button"
                  onClick={dismiss}
                  className="min-h-11 rounded-xl px-4 text-sm font-semibold text-muted transition hover:bg-line/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt"
                >
                  Continuar en Clarvex
                </button>
              ) : null}
              <button
                type="button"
                autoFocus
                onClick={captureAccess ? openCapture : dismiss}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-volt px-5 text-sm font-semibold text-white transition hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt focus-visible:ring-offset-2 active:scale-[0.99]"
              >
                {captureAccess ? "Conocer la nueva captura" : "Entrar a Clarvex"}
                {captureAccess ? <ArrowUpRight size={17} /> : null}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
