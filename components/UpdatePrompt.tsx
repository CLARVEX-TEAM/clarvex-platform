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
 * Se compara la huella del build que trae incrustada el propio cliente
 * (NEXT_PUBLIC_BUILD_ID, fijada al compilar) con la que devuelve el servidor
 * (ya reconstruido). Si difieren, el código que corre es viejo y se ofrece
 * recargar.
 *
 * Va en el layout global, no en la pantalla de login: así salta en cualquier
 * ruta, incluida la primera que ve el equipo tras volver a abrir la app.
 */
export default function UpdatePrompt() {
  const [showBanner, setShowBanner] = useState(false);
  const pathname = usePathname();

  // No mostrar el banner en ciertas rutas (ej. la de impresión de etiquetas,
  // donde un reload podría interrumpir un trabajo en curso).
  const hideOnRoutes = ["/etiquetas/imprimir"];
  const shouldHide = hideOnRoutes.some((route) => pathname?.startsWith(route));

  useEffect(() => {
    if (shouldHide) return;

    const current = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!current || current === "dev") return;

    const checkVersion = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { buildId } = await res.json();
        if (buildId && buildId !== current) {
          setShowBanner(true);
        }
      } catch (_) {
        // Sin conexión o error: no molestar.
      }
    };

    // Comprueba al cargar y luego cada 20 segundos.
    checkVersion();
    const interval = setInterval(checkVersion, 20_000);
    return () => clearInterval(interval);
  }, [pathname, shouldHide]);

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 shadow-lg shadow-black/20">
        <RefreshCw className="h-5 w-5 shrink-0 animate-spin text-white [animation-duration:3s]" />
        <p className="flex-1 text-sm font-bold text-white">Hay una versión nueva de la app.</p>
        <button
          onClick={() => {
            // Forzamos la recarga con un query param para evitar que el
            // navegador sirva el HTML desde su caché (aunque el SW no lo cachea,
            // el disco del navegador sí puede tenerlo). El servidor ignora el
            // parámetro, pero el navegador lo trata como una URL distinta.
            const url = new URL(window.location.href);
            url.searchParams.set("_t", Date.now().toString(36));
            window.location.href = url.toString();
          }}
          className="shrink-0 rounded-xl bg-white/20 px-3 py-1.5 text-xs font-semibold text-white transition active:scale-95"
        >
          Actualizar
        </button>
      </div>
    </div>
  );
}
