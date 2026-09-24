import { BarChart3, Boxes, CalendarDays, Clock, Users } from "lucide-react";
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

/**
 * ⚠️ **Plan de apagado, fase 2 (24 de septiembre de 2026): se CERRARON las
 * puertas de quince pantallas**: capacitación, encuestas, kudos, bitácora,
 * uniformes, solicitudes, faltantes, plan, pendientes, comunicados,
 * suscripción, dispositivos, chat, soporte y credencial.
 *
 * Las pantallas y sus datos siguen existiendo: solo se quitó por dónde llegar.
 * Es la forma de comprobar que estaban muertas de verdad y no dormidas. Si
 * alguien las reclama, se devuelven revirtiendo este cambio. No borrar tablas
 * ni datos por esto: se retira el código, no la historia.
 */

/** Gerencia y subgerencia. */
export const ACCESOS_GERENCIA: AccesoTelefono[] = [
  { href: "/horarios", icon: CalendarDays, label: "Horarios" },
  { href: "/asistencia", icon: Clock, label: "Asistencia" },
  { href: "/conteos", icon: Boxes, label: "Conteos" },
  // ⚠️ «Equipo» no estaba en la rejilla anterior: colgaba de un botón suelto de
  // `/manager`, así que dentro de la APK se quedó sin entrada igual que los
  // demás. Es donde se capturan los correos reales y se marca el celular de la
  // tienda como kiosko.
  { href: "/equipo", icon: Users, label: "Equipo" }
];

/** Asesores y vendedores. */
export const ACCESOS_ASESOR: AccesoTelefono[] = [
  { href: "/horarios", icon: CalendarDays, label: "Mis horarios" },
  { href: "/kpis", icon: BarChart3, label: "Mis KPIs" },
  { href: "/asistencia", icon: Clock, label: "Mi asistencia" },
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
export const DESTACADOS_MI_DIA = ["/horarios", "/conteos", "/checklist"];

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
