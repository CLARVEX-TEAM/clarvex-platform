"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeft, Smartphone, Terminal, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";
import { ProfileAvatar } from "@/components/ui";
import { isActiveNav, navGroups } from "@/components/desktop/nav";

type Props = {
  user: User;
  pinned: boolean;
  onTogglePin: () => void;
  onOpenPalette: () => void;
  onRelock: () => void;
  onLogout: () => void;
  onSwitchToMobile: () => void;
};

/**
 * Rail de navegación. Colapsado a 64px enseña solo iconos; se abre a 240px al
 * pasar el puntero o al recibir foco de teclado, y puede fijarse abierto.
 *
 * Al expandirse aparecen las etiquetas, así que no lleva tooltips por icono:
 * la lista necesita overflow-y y cualquier tooltip absoluto quedaría recortado.
 */
export function DeskRail({
  user, pinned, onTogglePin, onOpenPalette, onRelock, onLogout, onSwitchToMobile
}: Props) {
  const pathname = usePathname();
  const roleLabel = user.role === "GERENTE" ? "Gerente" : user.role === "SUBGERENTE" ? "Subgerente" : "";

  return (
    <div className="desk-rail fixed inset-y-0 left-0 z-[var(--z-rail)] w-[var(--desk-rail)]">
      <nav
        aria-label="Secciones del escritorio"
        // Translúcido + desenfoque: el rail flota sobre el fondo animado y deja
        // entrever los resplandores, igual que el header. Es la misma técnica
        // que .liquid-glass reserva para superficies flotantes.
        className="desk-rail-inner flex h-full flex-col overflow-hidden border-r border-line bg-card/80 backdrop-blur-xl"
      >
        {/* Marca + fijar */}
        <div className="flex h-16 shrink-0 items-center gap-3 px-3">
          <Link
            href="/escritorio"
            className="relative size-10 shrink-0 overflow-hidden rounded-xl"
            aria-label="Clarvex Team, ir al dashboard"
          >
            {/* El logo de marca real. El PNG ya trae su propio azul de marca,
                así que no lleva contenedor de color detrás. */}
            <Image src="/icon-512.png" alt="" fill sizes="40px" priority className="object-cover" />
          </Link>
          <span className="desk-rail-label min-w-0 flex-1 truncate text-ui font-semibold">
            Clarvex
          </span>
          <button
            type="button"
            onClick={onTogglePin}
            aria-pressed={pinned}
            aria-label={pinned ? "Soltar el menú" : "Fijar el menú abierto"}
            className="desk-rail-label grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-panel hover:text-ink"
          >
            <PanelLeft size={16} className={cn(pinned && "text-accent")} />
          </button>
        </div>

        {/* Disparador de la paleta: la alternativa visible al atajo de teclado,
            para quien no sabe que Ctrl+K existe. */}
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={onOpenPalette}
            className="flex h-10 w-full items-center gap-3 rounded-xl border border-line bg-panel px-2.5 text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <Terminal size={18} className="shrink-0" />
            <span className="desk-rail-label flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className="truncate text-ui">Buscar</span>
              <kbd className="shrink-0 rounded border border-line bg-card px-1.5 py-0.5 text-caption font-medium text-muted">
                Ctrl K
              </kbd>
            </span>
          </button>
        </div>

        {/* Secciones */}
        {/* Sin `no-scrollbar`: esa clase global mata también el
            ::-webkit-scrollbar, así que la barra fina del estado expandido
            nunca llegaba a dibujarse. El colapsado la oculta desde desktop.css. */}
        <div className="desk-rail-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1">
          {navGroups.map((group, groupIndex) => {
            const items = group.items.filter((item) =>
              (!item.adminOnly || user.platformAdmin) &&
              // Tienda con los KPIs apagados: se retira la entrada del menú.
              // Ausente se trata como encendido.
              !(user.kpisEnabled === false && item.href === "/escritorio/kpis")
            );
            if (items.length === 0) return null;
            return (
              <div key={group.label}>
                {groupIndex > 0 ? <hr className="desk-rule my-3" /> : null}
                <p className="desk-rail-label px-2.5 pb-1 pt-1 text-caption font-medium text-muted">
                  {group.label}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {items.map((item) => {
                    const active = isActiveNav(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex h-10 items-center gap-3 rounded-xl px-2.5 transition-colors",
                            active
                              ? "bg-accent-quiet text-accent"
                              : "text-ink-2 hover:bg-panel hover:text-ink"
                          )}
                        >
                          {/* icon-bold engrosa el trazo del icono activo (regla
                              global de la app): da la sensación "rellena" de SF
                              Symbols sin necesitar un segundo juego de iconos. */}
                          <span className={cn("grid shrink-0 place-items-center", active && "icon-bold")}>
                            <item.icon size={18} />
                          </span>
                          <span className="desk-rail-label min-w-0 flex-1 truncate text-ui font-medium">
                            {item.label}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Cuenta */}
        <div className="shrink-0 border-t border-line p-3">
          <Link
            href="/escritorio/perfil"
            className="flex h-12 items-center gap-3 rounded-xl px-1.5 transition-colors hover:bg-panel"
          >
            <ProfileAvatar
              name={user.name}
              photoUrl={user.photoUrl}
              size="sm"
              className="size-9 shrink-0 rounded-xl shadow-none"
            />
            <span className="desk-rail-label min-w-0 flex-1 leading-tight">
              <span className="block truncate text-ui font-medium text-ink">{user.name}</span>
              <span className="block truncate text-caption text-muted">{roleLabel}</span>
            </span>
          </Link>

          <RailAction icon={Smartphone} label="Ver versión móvil" onClick={onSwitchToMobile} />
          <RailAction icon={UsersRound} label="Cambiar de usuario" onClick={onRelock} />
          <RailAction icon={LogOut} label="Cerrar sesión" onClick={onLogout} tone="danger" />
        </div>
      </nav>
    </div>
  );
}

function RailAction({
  icon: Icon, label, onClick, tone
}: {
  icon: typeof LogOut;
  label: string;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 w-full items-center gap-3 rounded-xl px-2.5 transition-colors",
        tone === "danger"
          ? "text-danger hover:bg-danger/10"
          : "text-muted hover:bg-panel hover:text-ink"
      )}
    >
      <Icon size={18} className="shrink-0" />
      <span className="desk-rail-label min-w-0 flex-1 truncate text-left text-ui font-medium">
        {label}
      </span>
    </button>
  );
}
