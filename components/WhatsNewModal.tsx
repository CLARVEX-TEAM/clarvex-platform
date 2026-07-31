"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Calculator, EyeOff, KeyRound, LayoutDashboard, LifeBuoy, Wallet, X } from "lucide-react";

/**
 * Aviso de novedades.
 *
 * Subir RELEASE_KEY para volver a mostrarlo. La marca de "ya lo vi" va en
 * localStorage con esa clave, así que una clave nueva reabre el aviso para
 * todos sin tocar la base de datos.
 *
 * Decisiones de diseño, tras el rediseño de julio de 2026:
 *
 *  1. RESPONSIVO DE VERDAD. Antes era `max-w-md` (448 px) en cualquier pantalla:
 *     en un monitor de 1920 se veía como un teléfono pegado en medio. Ahora es
 *     hoja inferior en móvil y diálogo ancho a dos columnas en escritorio.
 *
 *  2. UN SOLO ACENTO. Antes cada novedad traía su propio color (seis en total) y
 *     el resultado era confeti. Ahora el azul se gasta en un solo sitio, la
 *     novedad destacada, y el resto va en tinta neutra.
 *
 *  3. LA ESTRUCTURA DICE ALGO. La novedad grande es un panel; las demás son
 *     filas separadas por una línea. No son diez tarjetas iguales fingiendo que
 *     todas pesan lo mismo.
 *
 *  4. `desk-adopt`: el aviso vive en el layout raíz, FUERA del subárbol
 *     [data-surface="desk"]. Sin esa clase se pintaría con la paleta del móvil
 *     encima del lienzo del escritorio (ver app/escritorio/desktop.css).
 */

const RELEASE_KEY = "clarvex-whatsnew-2026-07-30";

/** La novedad que justifica el aviso. Va sola y ocupa todo el ancho. */
const headline = {
  icon: LayoutDashboard,
  title: "Versión de escritorio nueva",
  body: "Desde una computadora la app ya no es el móvil estirado. Barra lateral de secciones, buscador con Ctrl+K y gráficas grandes de verdad."
};

/** El resto, en filas. Orden por lo que más se usa, no por lo más reciente. */
const changes: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: KeyRound,
    title: "Recupera tu PIN solo",
    body: "Si lo olvidas, te llega un enlace a tu correo. Ya no dependes de que tu gerente te lo restablezca."
  },
  {
    icon: Wallet,
    title: "Mi quincena",
    body: "Tu comisión acumulada y tu alcance del mes, en el tablero, sin esperar al cierre."
  },
  {
    icon: Calculator,
    title: "Simulador de comisión",
    body: "Te dice cuánto te falta vender para llegar al siguiente escalón."
  },
  {
    icon: EyeOff,
    title: "Conteo ciego",
    body: "En inventarios ya no ves lo que contó otro. Tu propio conteo sí lo ves."
  },
  {
    icon: LifeBuoy,
    title: "Soporte desde la app",
    body: "Reporta un problema sin salir de Clarvex y le damos seguimiento."
  }
];

export function WhatsNewModal() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Ni en el login ni en la redirección inicial: ahí no hay nada que celebrar.
    if (pathname === "/login" || pathname === "/") return;
    try {
      if (!localStorage.getItem(RELEASE_KEY)) setOpen(true);
    } catch {
      // localStorage bloqueado: no bloquear la app por un aviso.
    }
  }, [pathname]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(RELEASE_KEY, "1");
    } catch {
      /* da igual: se cierra en esta vista */
    }
    setOpen(false);
  }, []);

  // Escape cierra. Antes solo se podía tocando el fondo, que con teclado no
  // existe: quien navegue sin ratón se quedaba atrapado en el aviso.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, dismiss]);

  const panel = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 28, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 18, scale: 0.98 }
      };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={dismiss}
          role="dialog"
          aria-modal="true"
          aria-labelledby="whatsnew-title"
        >
          <motion.div
            onClick={(event) => event.stopPropagation()}
            {...panel}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="desk-adopt flex max-h-[92dvh] w-full max-w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-card shadow-2xl sm:max-h-[86vh] sm:max-w-xl sm:rounded-3xl lg:max-w-3xl"
          >
            {/* ── Cabecera ── */}
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-7 sm:py-5">
              <div className="min-w-0">
                <h2 id="whatsnew-title" className="text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
                  Novedades
                </h2>
                <p className="mt-0.5 text-[13px] leading-5 text-muted">Lo que cambió en Clarvex Team.</p>
              </div>
              <button
                onClick={dismiss}
                aria-label="Cerrar novedades"
                className="-mr-1.5 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-line/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt"
              >
                <X size={18} />
              </button>
            </div>

            {/* ── Contenido ── */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 [scrollbar-width:thin]">
              {/* La destacada: único sitio donde se gasta el color. */}
              <div className="flex flex-col gap-3 rounded-2xl border border-volt/25 bg-volt/[0.07] p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-volt text-white">
                  <headline.icon size={21} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold leading-6 tracking-[-0.015em] text-ink sm:text-base">
                    {headline.title}
                  </h3>
                  <p className="mt-1 text-[13px] leading-5 text-muted">{headline.body}</p>
                </div>
              </div>

              {/* El resto: filas con línea, no diez tarjetas iguales. En
                  escritorio se reparten en dos columnas para no dejar medio
                  monitor vacío ni obligar a hacer scroll. */}
              <ul className="mt-5 grid gap-x-8 sm:grid-cols-2">
                {changes.map((change, index) => (
                  <motion.li
                    key={change.title}
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + index * 0.05, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="flex items-start gap-3.5 border-b border-line/70 py-3.5 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0"
                  >
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-line/50 text-ink">
                      <change.icon size={16} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold leading-5 tracking-[-0.01em] text-ink">{change.title}</h3>
                      <p className="mt-0.5 text-[12.5px] leading-[1.45] text-muted">{change.body}</p>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* ── Pie ── */}
            {/* Flex y no `ml-auto` a secas: el botón es inline-block en cuanto
                deja de ser `w-full`, y ahí el margen automático no lo mueve. */}
            <div className="flex border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-end sm:px-7 sm:pb-4">
              <button
                onClick={dismiss}
                className="min-h-11 w-full rounded-xl bg-volt px-4 text-sm font-semibold text-white transition hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt focus-visible:ring-offset-2 active:scale-[0.99] sm:w-auto sm:min-w-[10rem]"
              >
                Entendido
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
