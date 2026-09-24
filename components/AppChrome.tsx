"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/ui";

/**
 * Monta la barra inferior UNA vez para toda la app móvil.
 *
 * Antes la renderizaba cada página. Eso la destruía y la recreaba en cada
 * navegación, con dos consecuencias: la pastilla activa no podía animarse
 * —framer-motion no tiene entre qué interpolar si el componente muere— y se
 * pedía la sesión otra vez en cada cambio de pantalla.
 *
 * Va FUERA de `PageTransition` a propósito. Dentro quedaba envuelta por un
 * elemento animado, y cualquier `transform` en ese envoltorio crea un
 * *containing block* que rompe su `position: fixed`.
 */

/**
 * Rutas de la app móvil que llevan barra. Lista explícita, no un prefijo: hay
 * pares que se parecen y se comportan distinto.
 *
 * - `/conteos/marbetes` la lleva, pero `/conteos/marbetes/imprimir` no: es una
 *   vista para imprimir.
 *
 * Una página nueva NO la tendrá hasta añadirla aquí. Es el error menos malo:
 * una barra que falta se ve enseguida; una barra encima del login o tapando una
 * conversación es peor y más difícil de notar.
 *
 * ⚠️ Las quince pantallas que cerró la fase 2 del plan de apagado (ver
 * `lib/accesos-telefono.ts`) salieron de esta lista a la vez que de los
 * accesos: una ruta con barra y sin entrada es justo lo que la guarda detecta.
 */
export const ROUTES_WITH_NAV = new Set([
  "/admin",
  "/advisor",
  "/asistencia",
  "/checklist",
  "/checklist/config",
  "/conteos",
  "/conteos/marbetes",
  "/equipo",
  "/horarios",
  "/kpis",
  "/manager",
  "/mi-dia",
  "/notificaciones",
  "/perfil"
]);

// Detalle de un conteo: `/conteos/<id>`. Un tercer segmento ya es la vista de
// impresión, que no lleva barra, así que el patrón se limita a dos.
const COUNT_DETAIL = /^\/conteos\/[^/]+$/;

export function showsBottomNav(pathname: string): boolean {
  return ROUTES_WITH_NAV.has(pathname) || COUNT_DETAIL.test(pathname);
}

export function AppChrome() {
  const pathname = usePathname() ?? "";
  if (!showsBottomNav(pathname)) return null;
  return <BottomNav />;
}
