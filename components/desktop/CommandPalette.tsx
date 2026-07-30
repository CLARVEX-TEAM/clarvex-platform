"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CornerDownLeft, Megaphone, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";
import { ProfileAvatar } from "@/components/ui";
import { useDesktopChrome } from "@/components/desktop/DesktopChrome";
import { navItems, normalize } from "@/components/desktop/nav";

type Command = {
  id: string;
  label: string;
  group: string;
  href: string;
  hint?: string;
  icon?: LucideIcon;
  photoUrl?: string | null;
  personName?: string;
  /** Texto plano y sin acentos contra el que se filtra. */
  haystack: string;
};

const roleLabel: Record<string, string> = {
  GERENTE: "Gerente",
  SUBGERENTE: "Subgerente",
  ASESOR: "Asesor"
};

/**
 * Paleta de comandos (Ctrl+K / ⌘K).
 *
 * Va sobre <dialog> nativo a propósito: la capa superior, la trampa de foco y
 * el cierre con Escape vienen de serie, sin guerra de z-index ni recorte por
 * overflow de ningún ancestro.
 */
export function CommandPalette({
  open, onClose, user
}: {
  open: boolean;
  onClose: () => void;
  user: User;
}) {
  const router = useRouter();
  const { people } = useDesktopChrome();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const sections: Command[] = navItems
      .filter((item) => !item.adminOnly || user.platformAdmin)
      .map((item) => ({
        id: `nav:${item.href}`,
        label: item.label,
        group: "Ir a",
        href: item.href,
        icon: item.icon,
        haystack: normalize(`${item.label} ${item.keywords ?? ""}`)
      }));

    const actions: Command[] = [
      {
        id: "new:pending",
        label: "Nuevo pendiente",
        group: "Crear",
        href: "/escritorio/pendientes",
        hint: "Abre Pendientes con el formulario listo",
        icon: AlertTriangle,
        haystack: normalize("nuevo pendiente crear tarea handover asignar")
      },
      {
        id: "new:announcement",
        label: "Nuevo comunicado",
        group: "Crear",
        href: "/escritorio/comunicados",
        hint: "Abre Comunicados con el formulario listo",
        icon: Megaphone,
        haystack: normalize("nuevo comunicado crear aviso anuncio publicar")
      }
    ];

    const roster: Command[] = people.map((person) => ({
      id: `person:${person.id}`,
      label: person.name,
      group: "Personas",
      href: "/escritorio/equipo",
      hint: roleLabel[person.role] ?? "Colaborador",
      photoUrl: person.photoUrl,
      personName: person.name,
      haystack: normalize(`${person.name} ${roleLabel[person.role] ?? ""}`)
    }));

    return [...sections, ...actions, ...roster];
  }, [people, user.platformAdmin]);

  const results = useMemo(() => {
    const term = normalize(query);
    if (!term) {
      // Sin texto: se enseña lo navegable y las acciones, no el padrón entero.
      return commands.filter((command) => command.group !== "Personas");
    }
    const matched = commands.filter((command) => command.haystack.includes(term));
    // Las coincidencias que empiezan por el término van primero: escribir "co"
    // debe ofrecer Comunicados antes que Reconocimientos.
    return matched
      .sort((a, b) => Number(b.haystack.startsWith(term)) - Number(a.haystack.startsWith(term)))
      .slice(0, 12);
  }, [commands, query]);

  // Abrir y cerrar el <dialog> siguiendo la prop.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      setQuery("");
      setActive(0);
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Mantener a la vista la opción activa cuando se recorre con el teclado.
  useEffect(() => {
    const list = listRef.current;
    const option = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    option?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function run(command: Command | undefined) {
    if (!command) return;
    onClose();
    router.push(command.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (results.length === 0 ? 0 : (i - 1 + results.length) % results.length));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(0, results.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[active]);
    }
  }

  let lastGroup = "";

  return (
    <dialog
      ref={dialogRef}
      className="desk-palette"
      aria-label="Buscar y ejecutar comandos"
      onClose={onClose}
      // Cierre al pulsar fuera: el <dialog> nativo no lo trae, y el backdrop
      // reporta el propio dialog como target del clic.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={18} className="shrink-0 text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded
          aria-controls="desk-palette-list"
          aria-activedescendant={results[active] ? `desk-cmd-${active}` : undefined}
          placeholder="Buscar sección, crear o ir a una persona…"
          // El anillo de foco se suprime desde desktop.css (.desk-palette input):
          // una clase de Tailwind no le gana en especificidad a la regla global.
          className="h-14 min-w-0 flex-1 border-0 bg-transparent text-body text-ink outline-none placeholder:text-muted"
        />
        <kbd className="shrink-0 rounded border border-line px-1.5 py-0.5 text-caption font-medium text-muted">
          Esc
        </kbd>
      </div>

      <ul id="desk-palette-list" ref={listRef} role="listbox" className="max-h-[22rem] overflow-y-auto p-2">
        {results.length === 0 ? (
          <li className="px-3 py-10 text-center">
            <p className="text-ui font-medium text-ink">Nada coincide con “{query}”</p>
            <p className="mt-1 text-caption text-muted">
              Prueba con el nombre de una sección, de un compañero, o escribe “nuevo”.
            </p>
          </li>
        ) : (
          results.map((command, index) => {
            const showGroup = command.group !== lastGroup;
            lastGroup = command.group;
            const isActive = index === active;
            return (
              <li key={command.id}>
                {showGroup ? (
                  <p className="px-3 pb-1 pt-3 text-caption font-medium text-muted first:pt-1">
                    {command.group}
                  </p>
                ) : null}
                <button
                  type="button"
                  id={`desk-cmd-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isActive}
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(command)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    isActive ? "bg-accent-quiet text-accent" : "text-ink hover:bg-panel"
                  )}
                >
                  {command.icon ? (
                    <command.icon size={18} className="shrink-0" />
                  ) : (
                    <ProfileAvatar
                      name={command.personName ?? command.label}
                      photoUrl={command.photoUrl}
                      size="sm"
                      className="size-[18px] shrink-0 rounded-md text-[9px] shadow-none"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-ui font-medium">{command.label}</span>
                  {command.hint ? (
                    <span className="shrink-0 truncate text-caption text-muted">{command.hint}</span>
                  ) : null}
                  {isActive ? <CornerDownLeft size={14} className="shrink-0 text-accent" /> : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </dialog>
  );
}
