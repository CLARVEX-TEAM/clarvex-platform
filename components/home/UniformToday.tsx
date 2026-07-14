"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Shirt } from "lucide-react";
import { outfitFor, swatchFor, type UniformDay, type UniformVariant } from "@/lib/uniforms";
import { Card } from "@/components/ui";

/**
 * El uniforme de HOY, en el inicio.
 *
 * Sin push a propósito: el equipo ya recibe resumen matutino, cierre, media
 * jornada, pendientes, chat y kudos. Una notificación más cada noche es ruido, y
 * el ruido hace que dejen de leer las que sí importan.
 *
 * Aquí lo ven al abrir la app, que es lo primero que hacen al llegar a la tienda.
 */
function todayWeekday(): number {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  return new Date(`${key}T00:00:00.000Z`).getUTCDay();
}

export function UniformToday() {
  const [day, setDay] = useState<UniformDay | null>(null);
  const [variant, setVariant] = useState<UniformVariant | null>(null);

  useEffect(() => {
    fetch("/api/uniforms", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() as Promise<{ days: UniformDay[]; myVariant: UniformVariant | null }> : null))
      .then((payload) => {
        if (!payload) return;
        setDay(payload.days.find((row) => row.weekday === todayWeekday()) ?? null);
        setVariant(payload.myVariant);
      })
      .catch(() => undefined);
  }, []);

  if (!day) return null;
  const outfit = outfitFor(day, variant);

  return (
    <Link href="/uniformes" className="block">
      <Card className="mt-3 flex items-center gap-3 p-3.5 transition active:scale-[0.99]">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-volt/12 text-volt">
          <Shirt size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-muted">Uniforme de hoy</p>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-black text-ink">
            <Dot garment={outfit.top} /> {outfit.top}
            <span className="text-muted">·</span>
            <Dot garment={outfit.bottom} /> {outfit.bottom}
          </p>
        </div>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </Card>
    </Link>
  );
}

function Dot({ garment }: { garment: string }) {
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/15 dark:ring-white/25"
      style={{ background: swatchFor(garment) }}
      aria-hidden
    />
  );
}
