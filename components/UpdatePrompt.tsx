"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";

/**
 * Avisa cuando la app que se está ejecutando ya no es la última.
 *
 * Por qué: en Android, al volver a la PWA desde "recientes" NO se recarga la
 * página — se reanuda la que ya estaba en memoria. Así que tras un despliegue el
 * equipo sigue con el código viejo hasta que casualmente cierre la app del todo.
 * Nadie sabe que hay que hacer eso, y pueden pasar semanas con un bug ya
 * arreglado.
 *
 * Se OFRECE recargar, no se fuerza: alguien podría estar a media captura y
 * perderlo. La decisión es suya.
 */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Paginas donde este aviso no tiene sentido.
 *
 * ⚠️ Es para el equipo que tiene la app INSTALADA. En la pagina publica de
 * producto le dice «actualiza» a alguien que nunca la ha abierto, y aparece
 * flotando encima de la portada.
 */
const SIN_AVISO = ["/producto", "/login", "/terminos", "/uso-aceptable", "/privacidad"];

export function UpdatePrompt() {
  const pathname = usePathname();
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (SIN_AVISO.some((ruta) => pathname.startsWith(ruta))) return;
    const current = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!current) return; // en desarrollo no aplica

    let cancelled = false;

    async function check() {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { buildId?: string };
        if (!cancelled && payload.buildId && payload.buildId !== current) {
          setStale(true);
        }
      } catch {
        // Sin conexión: se reintenta luego. Nunca molestar por un fallo de red.
      }
    }

    void check();
    const interval = setInterval(() => void check(), CHECK_INTERVAL_MS);
    // Al volver a la app (que es justo cuando se arrastra el bundle viejo).
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  if (!stale) return null;

  return (
    // `data-transient`: avisos que aparecen según el estado del navegador (hay
    // versión nueva, sin conexión, instalar PWA). Las pruebas visuales los
    // ocultan porque su presencia depende del entorno, no del diseño, y harían
    // que la misma pantalla se capturara distinta en cada ejecución.
    <div data-transient className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-md">
      <div className="flex items-center gap-3 rounded-2xl border border-volt/30 bg-volt px-4 py-3 shadow-lg">
        <RefreshCw size={18} className="shrink-0 text-white" />
        <p className="flex-1 text-sm font-bold text-white">Hay una versión nueva de la app.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-xl bg-white/20 px-3 py-1.5 text-xs font-semibold text-white transition active:scale-95"
        >
          Actualizar
        </button>
      </div>
    </div>
  );
}
