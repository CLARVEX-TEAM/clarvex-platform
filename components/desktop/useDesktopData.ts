"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { useDesktopChrome } from "@/components/desktop/DesktopChrome";

/**
 * Carga compartida de los datos del panel para las páginas de escritorio.
 * Devuelve los datos, un setter (para actualizaciones optimistas) y un reload.
 * Reporta la última actualización a la topbar (indicador de frescura).
 */
export function useDesktopData(pollMs = 5 * 60 * 1000) {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState(false);
  const { setLastUpdated } = useDesktopChrome();

  const reload = useCallback(
    () => fetchAppData().then((payload) => { setData(payload); setError(false); setLastUpdated(new Date()); }).catch(() => setError(true)),
    [setLastUpdated]
  );

  useEffect(() => {
    void reload();
    if (!pollMs) return;
    const id = setInterval(reload, pollMs);
    return () => clearInterval(id);
  }, [reload, pollMs]);

  return { data, setData, error, reload };
}
