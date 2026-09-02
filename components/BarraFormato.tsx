"use client";

/**
 * Barra de formato del compositor.
 *
 * Trabaja sobre el `textarea` que ya existe, insertando marcas — no es un
 * editor de texto enriquecido. Es a propósito: un `contenteditable` en el
 * teclado de un teléfono pelea con el autocorrector, con pegar desde otra app
 * y con el dictado, y el mensaje acaba guardándose distinto de lo que se ve.
 * Un textarea con marcas se comporta igual en los cinco teléfonos del equipo.
 *
 * Las marcas son las de Slack (`*negrita*`), así que el mensaje se ve bien
 * también al reflejarse allí, sin traducir nada.
 */

import { Bold, Italic, Strikethrough, Code, Quote, List, ListOrdered } from "lucide-react";
import { alternarMarca, alternarPrefijo } from "@/lib/chat-formato";
import { cn } from "@/lib/utils";

type Accion =
  | { clase: "marca"; signo: string }
  | { clase: "prefijo"; prefijo: string };

const BOTONES: Array<{ Icono: typeof Bold; titulo: string; accion: Accion }> = [
  { Icono: Bold,          titulo: "Negrita",       accion: { clase: "marca", signo: "*" } },
  { Icono: Italic,        titulo: "Cursiva",       accion: { clase: "marca", signo: "_" } },
  { Icono: Strikethrough, titulo: "Tachado",       accion: { clase: "marca", signo: "~" } },
  { Icono: Code,          titulo: "Código",        accion: { clase: "marca", signo: "`" } },
  { Icono: Quote,         titulo: "Cita",          accion: { clase: "prefijo", prefijo: "> " } },
  { Icono: List,          titulo: "Lista",         accion: { clase: "prefijo", prefijo: "- " } },
  { Icono: ListOrdered,   titulo: "Lista numerada", accion: { clase: "prefijo", prefijo: "1. " } }
];

export function BarraFormato({
  valor,
  onCambio,
  caja
}: {
  valor: string;
  onCambio: (texto: string) => void;
  caja: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const aplicar = (accion: Accion) => {
    const el = caja.current;
    // Sin la caja no se sabe qué hay seleccionado; marcar a ciegas al final
    // del texto sorprende más que no hacer nada.
    if (!el) return;

    const desde = el.selectionStart ?? valor.length;
    const hasta = el.selectionEnd ?? desde;

    if (accion.clase === "prefijo") {
      onCambio(alternarPrefijo(valor, desde, hasta, accion.prefijo));
      // Se devuelve el foco: si no, el teclado del teléfono se cierra en cada
      // botón y hay que volver a tocar la caja para seguir escribiendo.
      requestAnimationFrame(() => el.focus());
      return;
    }

    const r = alternarMarca(valor, desde, hasta, accion.signo);
    onCambio(r.texto);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.desde, r.hasta);
    });
  };

  return (
    <div
      className="mx-auto mb-1.5 flex max-w-md items-center gap-0.5 overflow-x-auto"
      role="toolbar"
      aria-label="Formato"
    >
      {BOTONES.map(({ Icono, titulo, accion }) => (
        <button
          key={titulo}
          type="button"
          title={titulo}
          aria-label={titulo}
          // `onMouseDown` con preventDefault en vez de `onClick`: al pulsar,
          // el navegador quita el foco del textarea y con él la selección, así
          // que el botón marcaría un rango vacío.
          onMouseDown={(e) => {
            e.preventDefault();
            aplicar(accion);
          }}
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg text-muted transition",
            "hover:bg-panel active:scale-90"
          )}
        >
          <Icono size={15} />
        </button>
      ))}
    </div>
  );
}
