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
  const { setLastUpdated, setPeople } = useDesktopChrome();

  const reload = useCallback(
    () => fetchAppData().then((payload) => {
      setData(payload);
      setError(false);
      setLastUpdated(new Date());
      // Publicar el padrón para la paleta de comandos: así el salto a persona
      // no cuesta una petición extra en las páginas que ya cargaron los datos.
      setPeople(payload.users.map((u) => ({ id: u.id, name: u.name, role: u.role, photoUrl: u.photoUrl })));
    }).catch(() => setError(true)),
    [setLastUpdated, setPeople]
  );

  useEffect(() => {
    void reload();
    if (!pollMs) return;
    const id = setInterval(reload, pollMs);
    return () => clearInterval(id);
  }, [reload, pollMs]);

  return { data, setData, error, reload };
}
