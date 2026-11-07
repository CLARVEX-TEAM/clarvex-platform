"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Heart } from "lucide-react";
import type { ResumenSemana } from "@/lib/campana";

/**
 * La banda de Tailored Help en las portadas: el lema, el avance de la TIENDA
 * contra la meta de la semana y lo que lleva quien la mira.
 *
 * Se carga sola y, si la campaña no está activa o falla, no pinta nada: una
 * banda de campaña rota en la portada estorba más de lo que ayuda.
 *
 * Colores salvia y crema, los del cartel; el texto usa los tokens de la app
 * para que el modo oscuro siga leyéndose.
 */

type Respuesta = {
  activa: boolean;
  tema?: { nombre: string; lema: string };
  gerencia?: boolean;
  resumen?: ResumenSemana;
  acumulado?: { tienda: number; propio: number | null } | null;
};

const pesos = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function BandaCampana({ className = "" }: { className?: string }) {
  const [datos, setDatos] = useState<Respuesta | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/campanas/tailored-help", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Respuesta | null) => {
        if (vivo) setDatos(d);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  if (!datos?.activa || !datos.resumen || !datos.tema) return null;
  const { resumen, tema } = datos;
  const propio = resumen.personas.length === 1 && !datos.gerencia ? resumen.personas[0].total : null;
  const ancho = resumen.meta > 0 ? Math.min(100, (resumen.total / resumen.meta) * 100) : 0;

  return (
    <Link
      href="/campanas/tailored-help"
      className={`tappable mt-4 block rounded-2xl border border-[#5F7464]/25 bg-[#5F7464]/10 p-4 ${className}`}
    >
      <div className="flex items-center gap-2">
        <Heart size={18} className="shrink-0 fill-[#5F7464] text-[#5F7464]" />
        <span className="text-sm font-semibold text-ink">{tema.nombre}</span>
        <span className="ml-auto text-xs font-semibold text-[#5F7464]">
          {resumen.alcance === null ? "Sin meta esta semana" : `${resumen.alcance} % de la meta`}
        </span>
        <ChevronRight size={16} className="text-muted" />
      </div>
      <p className="mt-1 text-xs text-muted">{tema.lema}</p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#5F7464]/15">
        <div className="h-full rounded-full bg-[#5F7464]" style={{ width: `${ancho}%` }} />
      </div>
      <div className="mt-2 flex items-baseline justify-between text-xs">
        <span className="text-ink">
          <span className="font-semibold">{pesos(resumen.total)}</span>
          <span className="text-muted"> de {pesos(resumen.meta)} esta semana</span>
        </span>
        {propio !== null ? <span className="text-muted">Tú: <span className="font-semibold text-ink">{pesos(propio)}</span></span> : null}
      </div>
    </Link>
  );
}
