"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuickLink({ href, icon: Icon, label, className = "" }: { href: string; icon: LucideIcon; label: string; className?: string }) {
  return (
    <Link href={href} className={cn("tappable solid-card group flex min-h-12 items-center gap-2.5 rounded-[22px] px-3 text-[13px] font-semibold tracking-[-0.01em] text-ink/90", className)}>
      <span className="grid size-8 place-items-center rounded-[16px] border border-volt/20 bg-volt/12 text-volt shadow-[inset_0_1px_0_rgb(255_255_255_/_0.12)] transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
        <Icon size={17} />
      </span>
      {label}
    </Link>
  );
}

export function FloatingActionButton({ href, icon: Icon = Plus, label }: { href: string; icon?: LucideIcon; label: string }) {
  return (
    // Abajo-IZQUIERDA a propósito: el botón del copiloto Clarvex es fijo abajo-
    // derecha en todas las pantallas (va en el layout). Si este FAB también fuera
    // a la derecha, quedarían uno encima del otro.
    //
    // ⚠️ **La separación crece con la barrita de gestos.** Estaba en `bottom-20`
    // --80 px-- calibrado para una barra inferior pegada al borde. Al separar la
    // barra de la barrita de gestos, la barra subió hasta unos 116 px y se tragó
    // este botón: en Pendientes quedaba encima de las pestañas y no se podía
    // tocar. Todo lo que viva encima de la barra tiene que subir CON ella.
    <Link href={href} className="tappable btn-sheen fixed bottom-[calc(5rem+var(--safe-bottom))] left-4 z-20 flex min-h-12 items-center gap-2 overflow-hidden rounded-full bg-volt px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgb(37_99_235_/_0.32)] hover:bg-[#1D4ED8]">
      <Icon size={18} />
      {label}
    </Link>
  );
}
