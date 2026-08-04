"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Wrench } from "lucide-react";
import { getSession } from "@/lib/auth";

/**
 * Aviso permanente para las tiendas GUESS mientras la app termina de adaptarse
 * a su esquema de comisiones nuevo.
 *
 * Sustituye a la pantalla de captura manual que estuvo aquí antes. Se retiró al
 * descubrir que el propio RDV de GUESS trae su tabulador dentro: pedirle a la
 * gerencia teclear treinta importes que el archivo ya contiene solo invitaba a
 * un dedazo en un dato de nómina — y peor, a capturar los de otra zona, porque
 * las láminas que circularon eran de la E y estas tiendas son D.
 *
 * NO se puede cerrar, y es deliberado. No es una notificación: es una
 * advertencia sobre cifras que ahora mismo pueden no ser las definitivas, y
 * tiene que seguir a la vista hasta que el esquema quede conectado. Un aviso
 * que se descarta se descarta el primer día y ya nadie lo vuelve a ver.
 */

const EXCLUDED = ["/login", "/recuperar", "/reset", "/suspendida", "/manual"];

export function GuessSchemeNotice() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  const excluded = !pathname || EXCLUDED.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  useEffect(() => {
    if (excluded) return;
    let cancelled = false;
    void (async () => {
      const session = await getSession().catch(() => null);
      if (!session || cancelled) return;
      // El modo demo no representa a una tienda real.
      if ((session as { demo?: boolean }).demo) return;
      if (session.role !== "GERENTE" && session.role !== "SUBGERENTE") return;
      try {
        const response = await fetch("/api/commission-scheme", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { isGuess?: boolean };
        if (!cancelled && data.isGuess) setShow(true);
      } catch {
        // Sin red no se insiste: reaparecerá en el siguiente intento.
      }
    })();
    return () => { cancelled = true; };
  }, [pathname, excluded]);

  if (!show || excluded) return null;

  return (
    <motion.div
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      role="status"
      aria-live="polite"
      // `desk-adopt` es obligatoria: esto se monta en el layout raíz, fuera del
      // subárbol [data-surface="desk"], así que sin ella se pintaría con la
      // paleta del móvil sobre el lienzo oscuro del escritorio.
      className="desk-adopt pointer-events-none fixed inset-x-0 top-0 z-[70] px-3 pt-[max(0.5rem,env(safe-area-inset-top))]"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-ember/30 bg-gradient-to-r from-ember/[0.16] to-ember/[0.06] px-3.5 py-2.5 shadow-[0_8px_24px_rgb(15_23_42_/_0.14)] backdrop-blur-md">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ember/15 text-ember">
          <Wrench size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-ink">
            Estamos trabajando en la compatibilidad con el esquema de comisiones nuevo de GUESS
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
            Mientras tanto, las cifras de comisión de esta tienda pueden no reflejar el tabulador nuevo.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
