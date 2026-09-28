"use client";

import Link from "next/link";
import { DESTACADOS_MI_DIA, accesosSecundarios } from "@/lib/accesos-telefono";

/**
 * El resto de las pantallas del teléfono, debajo de los accesos destacados.
 *
 * ⚠️ **No es una rejilla nueva: es la que «Mi día» se llevó por delante.**
 * `QuickActions` solo se pinta en `/advisor` y `/manager`, así que dentro de la
 * APK nueve pantallas se quedaron sin ninguna entrada. Ver `lib/accesos-telefono`.
 *
 * Va en DOS niveles a propósito. Arriba, los seis con dato vivo al lado
 * --cuántos pendientes, cuántos comunicados sin leer--, que son los que se
 * abren a diario. Aquí abajo, el resto, compactos y sin adorno: con trece
 * tarjetas iguales lo importante deja de verse, que es exactamente lo que pasa
 * cuando todo pesa lo mismo.
 */
export function MasAccesos({ role, kpisEnabled }: { role: string; kpisEnabled: boolean }) {
  const accesos = accesosSecundarios(role, kpisEnabled, DESTACADOS_MI_DIA);
  if (accesos.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold tracking-tight text-ink">Todo lo demás</h2>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {accesos.map((accion) => (
          <Link
            key={accion.href}
            href={accion.href}
            className="tappable flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-line bg-card px-3.5 py-3 transition active:scale-[0.985]"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-line bg-void text-ink/65">
              <accion.icon size={16} />
            </span>
            <span className="min-w-0 text-[12.5px] font-medium leading-snug tracking-[-0.01em] text-ink/85">
              {accion.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
