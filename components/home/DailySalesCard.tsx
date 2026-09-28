"use client";

import { motion } from "framer-motion";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { BorderBeam } from "@/components/magic/BorderBeam";

interface DailySalesCardProps {
  sales: number;
  goal: number;
  label?: string;
  delay?: number;
  className?: string;
  /** Haz de luz en el borde. Reservado para la tarjeta principal de la pantalla. */
  beam?: boolean;
}

/** Color del pill de alcance — semántico (verde / ámbar / rojo), no el acento. */
function pillTone(p: number): string {
  if (p >= 100) return "text-[#16A34A] bg-[#EAF6EE]";
  if (p >= 90) return "text-[#B45309] bg-[#FAF2E6]";
  return "text-[#DC2626] bg-[#FCECEC]";
}

export function DailySalesCard({ sales, goal, label = "Ventas de hoy", delay = 0.08, className, beam = false }: DailySalesCardProps) {
  const progress = goal > 0 ? Math.round((sales / goal) * 100) : 0;

  const card = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay }}
      className={cn("card-3d rounded-2xl border border-line bg-card px-5 py-4", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</p>
        {goal > 0 ? (
          <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", pillTone(progress))}>
            {progress}% de la meta
          </span>
        ) : null}
      </div>

      <p className="mt-2.5 text-[2.15rem] font-semibold leading-none tracking-[-0.03em] text-ink">
        <AnimatedNumber value={money(sales)} />
      </p>

      {goal > 0 ? (
        <p className="mt-2 text-[12.5px] text-muted">
          Meta del día <b className="font-semibold text-ink">{money(goal)}</b>
          {sales >= goal ? (
            <> · <span className="font-semibold text-[#16A34A]">cumplida +{money(sales - goal)}</span></>
          ) : (
            <> · faltan <b className="font-semibold text-ink">{money(goal - sales)}</b></>
          )}
        </p>
      ) : null}

      <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-line">
        <motion.div
          className="h-full rounded-full bg-[#2563EB]"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: delay + 0.2 }}
        />
      </div>
    </motion.div>
  );

  // El haz envuelve la tarjeta ya montada: así el resto del componente no
  // cambia y activarlo o no es una decisión de quien lo usa, no de la tarjeta.
  // Sin `radius`: el anillo de 2px pide un radio exterior 2px mayor que el
  // rounded-2xl (16px) de la tarjeta, y ese es justo el valor por defecto.
  return beam ? <BorderBeam>{card}</BorderBeam> : card;
}
