"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAppData, lastKnownAppData, type AppData } from "@/lib/app-data";

/**
 * Hook compartido por los dashboards de manager y advisor.
 *
 * Encapsula: carga inicial, auto-refresh cada 5 min, reconexión al
 * regresar a la pestaña (visibilitychange), y reconexión al recuperar
 * internet (evento custom `clarvex-online`).
 */
export function useAppData() {
  /*
   * Arranca con la última copia conocida, si la hay, para que el panel nunca
   * aparezca vacío. `useState` con función para no leer el disco en cada
   * render. Se refresca igual en el efecto de abajo.
   *
   * ⚠️ Pero la copia NO se puede enseñar en el primer pintado. Vive en el
   * navegador, así que el servidor --que no lo tiene-- pinta el esqueleto y el
   * cliente pintaba ya el panel lleno: dos árboles distintos en el mismo sitio,
   * y React tira el HTML del servidor y vuelve a pintar la pantalla ENTERA.
   * No da pantalla de error; se nota como un parpadeo al abrir y como las
   * animaciones de entrada cortadas a la mitad, y le pasa a todo el que haya
   * abierto la app antes --o sea, a toda la tienda.
   *
   * Por eso se lee igual de pronto, pero se ADOPTA justo después de hidratar:
   * el primer pintado coincide con el del servidor y la copia entra un cuadro
   * más tarde, que es lo que costaba el fallo.
   */
  const [copiaGuardada] = useState<AppData | null>(() => lastKnownAppData());
  const [hidratado, setHidratado] = useState(false);
  const [data, setData] = useState<AppData | null>(null);

  useEffect(() => { setHidratado(true); }, []);
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

  return {
    // Lo que llegó del servidor manda; si todavía no llegó, la copia guardada,
    // y solo una vez hidratado.
    data: data ?? (hidratado ? copiaGuardada : null),
    lastUpdated,
    loadFailed,
    setLoadFailed,
    load
  } as const;
}
