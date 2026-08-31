"use client";

/**
 * Cabecera propia del chat.
 *
 * La global (`AppHeader`) lleva el rótulo «CLARVEX Team», el título grande y la
 * campana de notificaciones. Está bien en el resto de la app, donde orienta;
 * en una conversación estorba, porque lo que hay que ver es **con quién estás
 * hablando** y si está en línea.
 *
 * No se toca `AppHeader`: lo usan veinte pantallas y cambiarlo por el chat
 * sería rehacer la app entera para arreglar una.
 */

import Link from "next/link";
import { ChevronLeft, Search, Users } from "lucide-react";
import { ProfileAvatar } from "@/components/ui";
import { cn } from "@/lib/utils";

export function CabeceraChat({
  titulo,
  estado,
  photoUrl,
  esGrupo,
  onFoto,
  buscando,
  onBuscar
}: {
  titulo: string;
  /** «en línea», «últ. vez ayer», «5 personas»… */
  estado: string;
  photoUrl: string | null;
  esGrupo: boolean;
  onFoto?: () => void;
  buscando: boolean;
  onBuscar: () => void;
}) {
  return (
    <header
      /*
       * Traslúcida con desenfoque: los mensajes pasan por debajo al hacer
       * scroll en vez de cortarse contra una barra opaca. Es lo que hace que
       * se sienta una capa y no un recuadro pegado arriba.
       */
      className="pt-safe sticky top-0 z-20 border-b border-line/60 bg-white/80 px-2 pb-2 backdrop-blur-xl dark:bg-[#0f1729]/80"
      style={{ ["--pt-safe-base" as string]: "0.5rem" }}
    >
      <div className="mx-auto flex max-w-md items-center gap-1">
        <Link
          href="/chat"
          aria-label="Volver a mensajes"
          className="grid size-10 shrink-0 place-items-center rounded-full text-volt transition active:scale-90"
        >
          <ChevronLeft size={26} strokeWidth={2.2} />
        </Link>

        {/* Centro: la foto y el nombre son el sujeto de la pantalla. */}
        <button
          type="button"
          onClick={onFoto}
          disabled={!onFoto}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-1 py-0.5 text-left transition active:scale-[0.98] disabled:active:scale-100"
        >
          {esGrupo ? (
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-volt/12 text-volt">
              <Users size={17} />
            </span>
          ) : (
            <ProfileAvatar name={titulo} photoUrl={photoUrl} size="sm" className="size-9 shrink-0 rounded-full" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-tight text-ink">{titulo}</span>
            {estado && (
              <span className="block truncate text-[11px] leading-tight text-muted">{estado}</span>
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={onBuscar}
          aria-label="Buscar en la conversación"
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full transition active:scale-90",
            buscando ? "bg-volt/15 text-volt" : "text-muted"
          )}
        >
          <Search size={19} />
        </button>
      </div>
    </header>
  );
}
