"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getSession } from "@/lib/auth";
import { accesosPara } from "@/lib/accesos-telefono";

/*
 * ⚠️ Las listas ya NO viven aquí: se movieron a `lib/accesos-telefono.ts`.
 *
 * Este componente solo se pinta en `/advisor` y `/manager`, así que cuando
 * «Mi día» sustituyó a esas portadas dentro de la APK se llevó consigo la única
 * entrada a nueve pantallas. Con la lista en un módulo aparte, «Mi día» ofrece
 * exactamente los mismos accesos y con el mismo reparto por puesto, y
 * `tests/accesos-telefono.test.ts` comprueba que ninguna quede huérfana.
 */

interface QuickActionsProps {
  variant?: "manager" | "advisor";
  delay?: number;
}

export function QuickActions({ variant = "manager", delay = 0.30 }: QuickActionsProps) {
  // Se asume encendido hasta saber lo contrario: si la consulta falla, es mejor
  // un acceso de más que ver la rejilla reacomodarse al cargar.
  const [kpisEnabled, setKpisEnabled] = useState(true);
  useEffect(() => {
    getSession().then((session) => setKpisEnabled(session?.kpisEnabled !== false)).catch(() => undefined);
  }, []);

  // `accesosPara` decide por PUESTO; aquí la variante ya viene resuelta por la
  // portada, así que se le pasa un puesto representativo de cada lado.
  const actions = accesosPara(variant === "manager" ? "GERENTE" : "ASESOR", kpisEnabled);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay }}
      className="grid grid-cols-2 gap-2.5"
    >
      {actions.map((action) => (
        <motion.div key={action.href} whileTap={{ scale: 0.985 }}>
          <Link
            href={action.href}
            className="card-3d flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-line bg-card px-3.5 py-3 transition hover:border-muted/50"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-line bg-void text-ink/65">
              <action.icon size={16} />
            </span>
            <span className="text-[12.5px] font-medium leading-snug tracking-[-0.01em] text-ink/85">
              {action.label}
            </span>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
