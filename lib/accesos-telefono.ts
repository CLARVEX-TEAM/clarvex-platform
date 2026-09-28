import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  Boxes,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  GraduationCap,
  HeartHandshake,
  MessageSquare,
  PackageSearch,
  Shirt,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Los accesos del teléfono, en UN solo sitio.
 *
 * ⚠️ **Antes vivían dentro de `components/home/QuickActions.tsx`**, que solo
 * pintan `/advisor` y `/manager`. Cuando «Mi día» sustituyó a esas portadas
 * dentro de la APK, ocho pantallas se quedaron **sin ninguna entrada en toda la
 * aplicación**: Bitácora, Reconocer, Asistencia, Días y cambios, Faltantes,
 * Capacitación, Encuestas y Suscripción. Seguían existiendo, seguían llevando
 * barra inferior y nadie podía llegar a ellas.
 *
 * No da error ni deja rastro: la pantalla está entera y el camino no existe.
 * Por eso la lista sale de aquí y `tests/accesos-telefono.test.ts` comprueba que
 * toda ruta con barra inferior tenga por dónde entrar.
 *
 * ⚠️ El reparto por puesto NO se reinventa: es el mismo que llevaba la portada
 * anterior en producción. Cambiarlo aquí lo cambia en los dos sitios a la vez,
 * que es justamente lo que se quiere.
 */

export type AccesoTelefono = {
  href: string;
  icon: LucideIcon;
  label: string;
};

/** Gerencia y subgerencia. */
export const ACCESOS_GERENCIA: AccesoTelefono[] = [
  { href: "/plan", icon: CheckSquare, label: "Crear plan del día" },
  { href: "/pendientes", icon: ClipboardList, label: "Crear pendiente" },
  { href: "/bitacora", icon: BookOpen, label: "Bitácora" },
  { href: "/chat", icon: MessageSquare, label: "Chat del equipo" },
  { href: "/horarios", icon: CalendarDays, label: "Horarios" },
  { href: "/kudos", icon: HeartHandshake, label: "Reconocer" },
  { href: "/credencial", icon: BadgeCheck, label: "Mi credencial" },
  { href: "/asistencia", icon: Clock, label: "Asistencia" },
  { href: "/uniformes", icon: Shirt, label: "Uniformes" },
  { href: "/solicitudes", icon: CalendarClock, label: "Días y cambios" },
  { href: "/faltantes", icon: PackageSearch, label: "Faltantes" },
  { href: "/capacitacion", icon: GraduationCap, label: "Capacitación" },
  { href: "/encuestas", icon: ClipboardCheck, label: "Encuestas" },
  { href: "/conteos", icon: Boxes, label: "Conteos" },
  // ⚠️ «Equipo» no estaba en la rejilla anterior: colgaba de un botón suelto de
  // `/manager`, así que dentro de la APK se quedó sin entrada igual que los
  // demás. Es donde se capturan los correos reales y se marca el celular de la
  // tienda como kiosko.
  { href: "/equipo", icon: Users, label: "Equipo" },
  { href: "/suscripcion", icon: CreditCard, label: "Suscripción" }
];

/** Asesores y vendedores. */
export const ACCESOS_ASESOR: AccesoTelefono[] = [
  { href: "/horarios", icon: CalendarDays, label: "Mis horarios" },
  { href: "/pendientes", icon: ClipboardList, label: "Pendientes" },
  { href: "/kpis", icon: BarChart3, label: "Mis KPIs" },
  { href: "/chat", icon: MessageSquare, label: "Chat del equipo" },
  { href: "/kudos", icon: HeartHandshake, label: "Reconocer" },
  { href: "/credencial", icon: BadgeCheck, label: "Mi credencial" },
  { href: "/asistencia", icon: Clock, label: "Mi asistencia" },
  { href: "/uniformes", icon: Shirt, label: "Uniformes" },
  { href: "/solicitudes", icon: CalendarClock, label: "Días y cambios" },
  { href: "/faltantes", icon: PackageSearch, label: "Faltantes" },
  { href: "/capacitacion", icon: GraduationCap, label: "Capacitación" },
  { href: "/encuestas", icon: ClipboardCheck, label: "Encuestas" },
  { href: "/conteos", icon: Boxes, label: "Conteos" }
];

/** Los puestos que ven la lista de gerencia. */
export function esGerencia(role: string): boolean {
  return role === "GERENTE" || role === "SUBGERENTE" || role === "REGIONAL" || role === "PLATFORM_ADMIN";
}

export function accesosPara(role: string, kpisEnabled: boolean): AccesoTelefono[] {
  const base = esGerencia(role) ? ACCESOS_GERENCIA : ACCESOS_ASESOR;
  // Se asume encendido hasta saber lo contrario: un acceso de más es preferible
  // a que la rejilla se reacomode al cargar la sesión.
  return kpisEnabled ? base : base.filter((accion) => accion.href !== "/kpis");
}

/**
 * Los que «Mi día» enseña en grande, con su dato vivo al lado (cuántos
 * pendientes hay abiertos, cuántos comunicados sin leer).
 *
 * ⚠️ Vive aquí y no dentro de la pantalla para que la prueba de cobertura mire
 * la MISMA lista que se pinta. Una copia en cada sitio se separa en cuanto
 * alguien toca una sola de las dos, y entonces la prueba deja de significar
 * nada sin dejar de pasar.
 */
export const DESTACADOS_MI_DIA = [
  "/horarios",
  "/pendientes",
  "/comunicados",
  "/conteos",
  "/checklist",
  "/dispositivos"
];

/**
 * Los que «Mi día» ya enseña en grande, con su dato vivo al lado.
 *
 * Se excluyen de la rejilla de abajo para no repetirlos: verlos dos veces en la
 * misma pantalla hace dudar de si son lo mismo.
 */
export function accesosSecundarios(role: string, kpisEnabled: boolean, yaDestacados: string[]): AccesoTelefono[] {
  const destacados = new Set(yaDestacados);
  return accesosPara(role, kpisEnabled).filter((accion) => !destacados.has(accion.href));
}
