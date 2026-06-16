"use client";

import { useState } from "react";
import { Boxes, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { StoreMap } from "@/components/StoreMap";
import { StoreMap3D } from "@/components/StoreMap3D";

/**
 * Mapa de tienda: vista 3D (consulta, todos) + administrar (cuadrícula, gerencia).
 * Los asesores solo ven la vista 3D.
 */
export function StoreMapTabs({ canEdit }: { canEdit: boolean }) {
  const [tab, setTab] = useState<"vista" | "admin">("vista");

  if (!canEdit) return <StoreMap3D />;

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-full bg-panel p-1 ring-1 ring-line">
        <button
          onClick={() => setTab("vista")}
          className={cn("tappable flex min-h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-black transition", tab === "vista" ? "bg-volt text-white shadow-[0_6px_16px_rgb(37_99_235_/_0.25)]" : "text-muted hover:text-ink")}
        >
          <Boxes size={15} /> Vista 3D
        </button>
        <button
          onClick={() => setTab("admin")}
          className={cn("tappable flex min-h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-black transition", tab === "admin" ? "bg-volt text-white shadow-[0_6px_16px_rgb(37_99_235_/_0.25)]" : "text-muted hover:text-ink")}
        >
          <Pencil size={15} /> Administrar
        </button>
      </div>
      {tab === "vista" ? <StoreMap3D /> : <StoreMap canEdit />}
    </div>
  );
}
