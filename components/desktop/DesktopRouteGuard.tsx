"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

// Mismo umbral que DESKTOP_MIN_WIDTH en DesktopShell. Se define aquí para no
// arrastrar todo el shell de escritorio al bundle global del layout.
const DESKTOP_MIN_WIDTH = 1024;

// Rutas de gerencia que tienen equivalente en el escritorio (/escritorio/<seg>).
const MIRRORED = new Set([
  "bitacora", "capacitacion", "chat", "checklist", "comunicados", "conteos", "datos",
  "encuestas", "equipo", "faltantes", "horarios", "kpis", "kudos", "mundial", "partido",
  "pendientes", "perfil", "plan", "solicitudes", "notificaciones"
]);
// Nunca redirigir: público, admin de plataforma (sin versión escritorio) y vistas de impresión.
const NEVER = ["/login", "/privacidad", "/terminos", "/suspendida", "/admin", "/partido/ver", "/conteos/marbetes/imprimir"];

/**
 * Lleva a gerencia a la versión de ESCRITORIO desde CUALQUIER ruta cuando abren
 * la app en una pantalla grande (computadora). Antes solo funcionaba al entrar
 * por /manager; si abrían una URL directa (p. ej. /datos) se quedaban en la
 * versión móvil, que no muestra todas las funciones. No afecta a los asesores.
 */
export function DesktopRouteGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth < DESKTOP_MIN_WIDTH) return;
    if (!pathname || pathname.startsWith("/escritorio")) return;
    if (NEVER.some((route) => pathname === route || pathname.startsWith(`${route}/`))) return;

    const segment = pathname.split("/")[1] ?? "";
    let target: string | null = null;
    if (pathname === "/manager") target = "/escritorio";
    else if (MIRRORED.has(segment)) target = `/escritorio/${segment}`;
    if (!target) return;

    getSession()
      .then((session) => { if (session && session.role !== "ASESOR") router.replace(target as string); })
      .catch(() => {});
  }, [pathname, router]);

  return null;
}
