"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAppData, type AppData } from "@/lib/app-data";

/**
 * Carga compartida de los datos del panel para las páginas de escritorio.
 * Devuelve los datos, un setter (para actualizaciones optimistas) y un reload.
 */
export function useDesktopData(pollMs = 5 * 60 * 1000) {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState(false);

  const reload = useCallback(
    () => fetchAppData().then((payload) => { setData(payload); setError(false); }).catch(() => setError(true)),
    []
  );

  useEffect(() => {
    void reload();
    if (!pollMs) return;
    const id = setInterval(reload, pollMs);
    return () => clearInterval(id);
  }, [reload, pollMs]);

  return { data, setData, error, reload };
}
