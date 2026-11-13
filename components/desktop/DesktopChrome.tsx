"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@/lib/types";

/** Persona mínima que necesita la paleta de comandos para ofrecer un salto. */
export type ChromePerson = { id: string; name: string; role: string; photoUrl?: string | null };

type ChromeContextValue = {
  user: User | null;
  lastUpdated: Date | null;
  setLastUpdated: (date: Date) => void;
  /** Padrón del equipo, publicado por useDesktopData. La paleta de comandos lo
      lee de aquí en vez de disparar su propia petición. */
  people: ChromePerson[];
  setPeople: (people: ChromePerson[]) => void;
};

const DesktopChromeContext = createContext<ChromeContextValue>({
  user: null,
  lastUpdated: null,
  setLastUpdated: () => {},
  people: [],
  setPeople: () => {}
});

export function DesktopChromeProvider({ user, children }: { user: User; children: React.ReactNode }) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [people, setPeople] = useState<ChromePerson[]>([]);
  return (
    <DesktopChromeContext.Provider value={{ user, lastUpdated, setLastUpdated, people, setPeople }}>
      {children}
    </DesktopChromeContext.Provider>
  );
}

export function useDesktopChrome() {
  return useContext(DesktopChromeContext);
}

/** Píldora "Actualizado hace Xm" que se refresca sola cada minuto. */
export function FreshnessPill() {
  const { lastUpdated } = useDesktopChrome();
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!lastUpdated) return null;
  const mins = Math.floor((Date.now() - lastUpdated.getTime()) / 60_000);
  const label = mins <= 0 ? "Actualizado ahora" : mins === 1 ? "Actualizado hace 1 min" : `Actualizado hace ${mins} min`;

  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] font-bold text-muted lg:inline-flex">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      {label}
    </span>
  );
}
