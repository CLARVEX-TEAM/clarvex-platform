"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAppData, type AppData } from "@/lib/app-data";

/**
 * Hook compartido por los dashboards de manager y advisor.
 *
 * Encapsula: carga inicial, auto-refresh cada 5 min, reconexión al
 * regresar a la pestaña (visibilitychange), y reconexión al recuperar
 * internet (evento custom `clarvex-online`).
 */
export function useAppData() {
  const [data, setData] = useState<AppData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(
    () =>
      fetchAppData()
        .then((d) => { setData(d); setLastUpdated(new Date()); setLoadFailed(false); })
        .catch(() => setLoadFailed(true)),
    []
  );

  useEffect(() => {
    void load();
    const id = setInterval(load, 5 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("clarvex-online", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("clarvex-online", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  return { data, lastUpdated, loadFailed, setLoadFailed, load } as const;
}
