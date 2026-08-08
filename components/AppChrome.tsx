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
 * - `/chat` la lleva, pero `/chat/<id>` no: la conversación va a pantalla
 *   completa.
 * - `/conteos/marbetes` la lleva, pero `/conteos/marbetes/imprimir` no: es una
 *   vista para imprimir.
 *
 * Una página nueva NO la tendrá hasta añadirla aquí. Es el error menos malo:
 * una barra que falta se ve enseguida; una barra encima del login o tapando una
 * conversación es peor y más difícil de notar.
 */
const ROUTES_WITH_NAV = new Set([
  "/admin",
  "/advisor",
  "/asistencia",
  "/bitacora",
  "/capacitacion",
  "/chat",
  "/checklist",
  "/checklist/config",
  "/comunicados",
  "/conteos",
  "/conteos/marbetes",
  "/datos",
  "/encuestas",
  "/equipo",
  "/faltantes",
  "/horarios",
  "/kpis",
  "/kudos",
  "/manager",
  "/notificaciones",
  "/pendientes",
  "/perfil",
  "/plan",
  "/solicitudes",
  "/soporte",
  "/suscripcion",
  "/uniformes"
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
