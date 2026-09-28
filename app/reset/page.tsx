"use client";

import { useEffect, useState } from "react";

/**
 * Rescate universal para un equipo "pegado".
 *
 * Un dispositivo atrapado en un bucle de versión corre el bundle VIEJO en memoria
 * y nunca hace una navegación real, así que no descarga los arreglos. Escribir a
 * mano `app.adrianluna.mx/reset` SÍ es una navegación real: carga código fresco,
 * desregistra el service worker, borra las cachés y las preferencias de vista, y
 * recarga limpio. Es la salida garantizada sin tener que borrar datos a mano.
 *
 * Ruta pública a propósito (fuera del matcher del middleware): tiene que funcionar
 * aunque la sesión o la versión estén en mal estado.
 */
export default function ResetPage() {
  const [status, setStatus] = useState("Limpiando la app…");

  useEffect(() => {
    let done = false;
    async function clean() {
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch { /* seguir */ }
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch { /* seguir */ }
      try {
        // Preferencia y banderas de versión: que la detección (ya corregida) mande.
        window.localStorage.removeItem("clarvex-view");
        window.sessionStorage.clear();
      } catch { /* seguir */ }

      if (done) return;
      done = true;
      setStatus("Listo. Reabriendo la app…");
      // Recarga dura: navegación real que trae el código nuevo.
      setTimeout(() => { window.location.replace("/login"); }, 900);
    }
    void clean();
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-card px-8 text-center">
      <div>
        <div className="mx-auto mb-5 size-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <p className="text-base font-semibold text-ink">{status}</p>
        <p className="mt-2 text-sm text-muted">CLARVEX Team</p>
      </div>
    </main>
  );
}
