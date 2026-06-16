"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  BarChart3,
  TrendingUp,
  ReceiptText,
  Camera,
  CalendarClock,
  Award,
  PartyPopper,
  Flame,
  MessageCircle,
  BellRing,
  Sparkles,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";

// Subir esta version cada vez que se quiera volver a mostrar el anuncio con nuevas funciones.
const RELEASE_KEY = "clarvex-whatsnew-2026-06-15";

type Accent = "volt" | "purple" | "ember" | "sky" | "mint" | "orchid";

const accent: Record<Accent, { text: string; bg: string; ring: string }> = {
  volt: { text: "text-volt", bg: "bg-volt/12", ring: "ring-volt/25" },
  purple: { text: "text-purple", bg: "bg-purple/12", ring: "ring-purple/25" },
  ember: { text: "text-ember", bg: "bg-ember/12", ring: "ring-ember/25" },
  sky: { text: "text-sky", bg: "bg-sky/12", ring: "ring-sky/25" },
  mint: { text: "text-success", bg: "bg-success/12", ring: "ring-success/25" },
  orchid: { text: "text-orchid", bg: "bg-orchid/12", ring: "ring-orchid/25" }
};

const features: { icon: LucideIcon; title: string; body: string; tone: Accent }[] = [
  {
    icon: CalendarClock,
    title: "Solicitudes de turno",
    body: "Pide cambio de turno, dia libre, vacaciones, descanso o pago de dia, y usa tu banco de horas.",
    tone: "volt"
  },
  {
    icon: BarChart3,
    title: "Ranking de KPIs",
    body: "Compara al equipo por venta, conversion, UPT y ticket promedio.",
    tone: "sky"
  },
  {
    icon: TrendingUp,
    title: "Tendencia de venta",
    body: "Mira la evolucion de tu venta directo en el dashboard.",
    tone: "mint"
  },
  {
    icon: ReceiptText,
    title: "Recibo de comisiones",
    body: "Nueva pestana con tu estado de comisiones del mes y el historico.",
    tone: "purple"
  },
  {
    icon: Award,
    title: "Kudos del equipo",
    body: "Reconoce a tus companeros con un kudo entre pares.",
    tone: "ember"
  },
  {
    icon: Flame,
    title: "Rachas y logros",
    body: "Suma rachas y desbloquea logros por tu actividad diaria.",
    tone: "orchid"
  },
  {
    icon: PartyPopper,
    title: "Celebraciones",
    body: "Cumpleanos y aniversarios del equipo, ahora visibles en el inicio.",
    tone: "sky"
  },
  {
    icon: BookOpen,
    title: "Biblioteca de recursos",
    body: "Capacitacion del equipo con materiales, guias y discusion en un solo lugar.",
    tone: "purple"
  },
  {
    icon: Camera,
    title: "Reporte de faltantes",
    body: "Levanta faltantes de inventario con foto directo desde tu telefono.",
    tone: "ember"
  },
  {
    icon: MessageCircle,
    title: "Comentarios en comunicados",
    body: "Responde un comunicado y se le notifica al autor.",
    tone: "volt"
  },
  {
    icon: BellRing,
    title: "Avisos automaticos",
    body: "Te recordamos los pendientes por vencer y alertamos a gerencia el bajo desempeno.",
    tone: "mint"
  }
];

export function WhatsNewModal() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // No mostrar en login ni en la pantalla de redireccion inicial.
    if (pathname === "/login" || pathname === "/") return;
    try {
      if (!localStorage.getItem(RELEASE_KEY)) {
        setOpen(true);
      }
    } catch {
      // localStorage no disponible: no bloquear la app.
    }
  }, [pathname]);

  function dismiss() {
    try {
      localStorage.setItem(RELEASE_KEY, "1");
    } catch {
      // ignorar
    }
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-end sm:place-items-center bg-slate-950/55 p-3 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={dismiss}
          role="dialog"
          aria-modal="true"
          aria-label="Novedades de la app"
        >
          <motion.div
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: 32, scale: 0.96, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 24, scale: 0.97, filter: "blur(4px)" }}
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
            className="liquid-glass relative mx-auto w-full max-w-md overflow-hidden rounded-[30px] bg-white/92 dark:bg-[#101a30]/95 p-5 shadow-[0_24px_60px_rgb(15_23_42_/_0.28)]"
          >
            {/* halo decorativo */}
            <div className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full bg-volt/20 blur-3xl" />
            <div className="pointer-events-none absolute -left-12 top-24 size-36 rounded-full bg-purple/20 blur-3xl" />

            <button
              onClick={dismiss}
              aria-label="Cerrar"
              className="absolute right-3.5 top-3.5 grid size-9 place-items-center rounded-full text-muted transition hover:bg-slate-100 dark:hover:bg-white/5 active:scale-95"
            >
              <X size={18} />
            </button>

            <div className="relative">
              <motion.span
                initial={{ scale: 0.4, rotate: -25, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.08 }}
                className="grid size-14 place-items-center rounded-[22px] bg-volt/14 text-volt ring-1 ring-volt/25 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.18)]"
              >
                <Sparkles size={26} />
              </motion.span>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-volt/90">Novedades de hoy</p>
              <h2 className="mt-1 text-[1.5rem] font-black leading-tight tracking-[-0.035em] text-ink">
                Estrenamos cosas nuevas
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-muted">
                Esto es lo que lanzamos hoy en CLARVEX Team. Echale un ojo.
              </p>
            </div>

            <ul className="relative mt-4 max-h-[42vh] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {features.map((feature, index) => {
                const a = accent[feature.tone];
                return (
                  <motion.li
                    key={feature.title}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.12 + Math.min(index, 6) * 0.06, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="flex items-start gap-3 rounded-[20px] border border-line/70 bg-slate-50/60 dark:bg-white/[0.03] p-3"
                  >
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-[15px] ring-1", a.bg, a.ring, a.text)}>
                      <feature.icon size={19} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-black leading-5 tracking-[-0.02em] text-ink">{feature.title}</h3>
                      <p className="mt-0.5 text-[12px] leading-4 text-muted">{feature.body}</p>
                    </div>
                  </motion.li>
                );
              })}
            </ul>

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.3 }}
              whileTap={{ scale: 0.98, y: 1 }}
              onClick={dismiss}
              className="relative mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-volt px-4 text-sm font-black tracking-[-0.01em] text-white shadow-[0_8px_20px_rgb(37_99_235_/_0.28)] transition hover:bg-[#1D4ED8]"
            >
              <Sparkles size={17} />
              Entendido, a explorar
            </motion.button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
