"use client";

/**
 * Ficha de un compañero, al tocar su foto en el chat.
 *
 * ⚠️ Enseña **solo lo que todo el equipo ya podía ver**: puesto, cumpleaños y
 * antigüedad — los datos que existen para las celebraciones. Horas,
 * vacaciones y días pagados son de gerencia o de uno mismo y no entran aquí.
 * Abrir una ficha desde el chat no puede ser la puerta trasera a datos de RH.
 */

import { useEffect } from "react";
import { Cake, Briefcase } from "lucide-react";
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

  // Escape cierra: en escritorio se espera, y sin ello la única salida sería
  // el ratón.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-65 flex items-end justify-center bg-black/30 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Ficha de ${persona.name}`}
    >
      <div
        /*
         * Una sola tarjeta con las filas dentro, no cajas sueltas: agrupar es
         * lo que hace que se lea como una ficha y no como dos avisos.
         */
        className="w-full max-w-sm rounded-t-[28px] bg-card px-5 pb-9 pt-3 shadow-2xl sm:rounded-[28px] sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-6 h-1 w-9 rounded-full bg-line sm:hidden" />

        <div className="flex flex-col items-center gap-3 text-center">
          <ProfileAvatar
            name={persona.name}
            photoUrl={persona.photoUrl}
            size="lg"
            className="size-24 rounded-full text-2xl"
          />
          <div className="space-y-0.5">
            <p className="text-[19px] font-semibold leading-tight tracking-[-0.01em] text-ink">
              {persona.name}
            </p>
            <p className="text-[13px] text-muted">
              {puestoLegible(persona.role)}
              {persona.online && <span className="text-mint"> · En línea</span>}
            </p>
          </div>
        </div>

        {cumple || anos ? (
          <div className="mt-6 overflow-hidden rounded-2xl bg-panel">
            {cumple && (
              <Fila
                icono={<Cake size={17} />}
                etiqueta="Cumpleaños"
                valor={esHoy ? `${cumple} · ¡hoy!` : cumple}
                destacado={esHoy}
              />
            )}
            {cumple && anos && <div className="ml-[54px] h-px bg-line/70" />}
            {anos && <Fila icono={<Briefcase size={17} />} etiqueta="En la tienda" valor={anos} />}
          </div>
        ) : (
          // Se dice que falta el dato, en vez de enseñar una ficha vacía que
          // parece rota.
          <p className="mt-6 text-center text-[13px] text-muted">
            Todavía no tiene cumpleaños ni fecha de ingreso capturados.
          </p>
        )}
      </div>
    </div>
  );
}

function Fila({
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
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full",
          destacado ? "bg-volt/15 text-volt" : "bg-white text-muted dark:bg-white/10"
        )}
      >
        {icono}
      </span>
      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
        <span className="text-[13px] text-muted">{etiqueta}</span>
        <span className={cn("truncate text-[15px] font-medium", destacado ? "text-volt" : "text-ink")}>
          {valor}
        </span>
      </div>
    </div>
  );
}
