"use client";

import { useEffect } from "react";

/**
 * Avisa antes de cerrar/recargar la pestaña si hay cambios sin guardar.
 * (El navegador muestra su propio diálogo de confirmación.)
 */
export function useUnsavedGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}
