"use client";

/**
 * Ficha de un compañero, al tocar su foto en el chat.
 *
 * ⚠️ Enseña **solo lo que todo el equipo ya podía ver**: puesto, cumpleaños y
 * antigüedad — los datos que existen para las celebraciones. Horas,
 * vacaciones y días pagados son de gerencia o de uno mismo y no entran aquí.
 * Abrir una ficha desde el chat no puede ser la puerta trasera a datos de RH.
 */

import { Cake, Briefcase, X } from "lucide-react";
import { ProfileAvatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import { antiguedad, cumpleHoy, cumpleaños, puestoLegible } from "@/lib/perfil-companero";
import type { ChatMemberView } from "@/lib/chat-client";

export function FichaCompanero({
  persona,
  onClose
}: {
  persona: ChatMemberView;
  onClose: () => void;
}) {
  const anos = antiguedad(persona.hireDate);
  const cumple = cumpleaños(persona.birthDate);
  const esHoy = cumpleHoy(persona.birthDate);

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Ficha de ${persona.name}`}
    >
      <div
        className="w-full rounded-t-3xl bg-white p-5 pb-8 shadow-2xl dark:bg-[#0f1729]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />

        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-5 top-5 grid size-9 place-items-center rounded-2xl bg-panel text-muted transition active:scale-95"
        >
          <X size={17} />
        </button>

        <div className="flex flex-col items-center gap-2 text-center">
          <ProfileAvatar name={persona.name} photoUrl={persona.photoUrl} size="lg" />
          <div>
            <p className="text-base font-bold leading-tight text-ink">{persona.name}</p>
            <p className="text-xs font-semibold text-muted">{puestoLegible(persona.role)}</p>
          </div>
          {persona.online && (
            <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-[11px] font-bold text-green-600 dark:text-green-400">
              <span className="size-1.5 rounded-full bg-green-500" /> En línea
            </span>
          )}
        </div>

        {(cumple || anos) && (
          <div className="mt-5 flex flex-col gap-2">
            {cumple && (
              <Dato
                icono={<Cake size={16} />}
                etiqueta="Cumpleaños"
                valor={esHoy ? `${cumple} — ¡hoy!` : cumple}
                destacado={esHoy}
              />
            )}
            {anos && <Dato icono={<Briefcase size={16} />} etiqueta="En la tienda" valor={anos} />}
          </div>
        )}

        {!cumple && !anos && (
          // Se dice que no hay dato, en vez de enseñar una ficha vacía que
          // parece rota.
          <p className="mt-5 text-center text-xs text-muted">
            Todavía no tiene fecha de cumpleaños ni de ingreso capturadas.
          </p>
        )}
      </div>
    </div>
  );
}

function Dato({
  icono,
  etiqueta,
  valor,
  destacado = false
}: {
  icono: React.ReactNode;
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl px-4 py-3",
        destacado ? "bg-volt/10" : "bg-panel"
      )}
    >
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", destacado ? "bg-volt/15 text-volt" : "bg-white text-muted dark:bg-white/10")}>
        {icono}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{etiqueta}</p>
        <p className={cn("text-sm font-bold", destacado ? "text-volt" : "text-ink")}>{valor}</p>
      </div>
    </div>
  );
}
