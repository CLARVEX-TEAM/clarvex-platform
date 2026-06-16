"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ChromeContextValue = {
  lastUpdated: Date | null;
  setLastUpdated: (date: Date) => void;
};

const DesktopChromeContext = createContext<ChromeContextValue>({
  lastUpdated: null,
  setLastUpdated: () => {}
});

export function DesktopChromeProvider({ children }: { children: React.ReactNode }) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  return (
    <DesktopChromeContext.Provider value={{ lastUpdated, setLastUpdated }}>
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
