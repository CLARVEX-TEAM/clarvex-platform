import {
  Award, Boxes, CalendarRange, ChartColumn, ClipboardCheck, ClipboardList, Database,
  FileClock, Gauge, GraduationCap, Megaphone, MessagesSquare, NotebookPen, PackageSearch,
  ShieldCheck, Target, TriangleAlert, Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Sinónimos para que la paleta encuentre la sección aunque se escriba de otro modo. */
  keywords?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

/**
 * Fuente única de la navegación de escritorio. La consumen el rail y la paleta
 * de comandos: si se añade una sección aquí, aparece en los dos sitios.
 */
export const navGroups: NavGroup[] = [
  {
    label: "Operación",
    items: [
      { href: "/escritorio", label: "Dashboard", icon: Gauge, keywords: "inicio resumen panel home" },
      { href: "/escritorio/kpis", label: "KPIs", icon: ChartColumn, keywords: "venta meta upt aur ept conversion alcance" },
      { href: "/escritorio/equipo", label: "Equipo", icon: Users, keywords: "asesores colaboradores personal gente" },
      { href: "/escritorio/horarios", label: "Horarios", icon: CalendarRange, keywords: "turnos agenda semana descanso" }
    ]
  },
  {
    label: "Día a día",
    items: [
      { href: "/escritorio/plan", label: "Plan del día", icon: Target, keywords: "actividades enfoque objetivos" },
      { href: "/escritorio/pendientes", label: "Pendientes", icon: TriangleAlert, keywords: "handover tareas criticos vencidos" },
      { href: "/escritorio/checklist", label: "Checklist", icon: ClipboardCheck, keywords: "apertura cierre evidencia" },
      { href: "/escritorio/comunicados", label: "Comunicados", icon: Megaphone, keywords: "avisos anuncios mensajes" },
      { href: "/escritorio/chat", label: "Chat", icon: MessagesSquare, keywords: "mensajes directos conversacion" },
      { href: "/escritorio/bitacora", label: "Bitácora", icon: NotebookPen, keywords: "registro incidencias log" }
    ]
  },
  {
    label: "Gestión",
    items: [
      { href: "/escritorio/solicitudes", label: "Solicitudes", icon: FileClock, keywords: "permisos vacaciones cambio turno aprobaciones" },
      { href: "/escritorio/conteos", label: "Conteos", icon: Boxes, keywords: "inventario marbetes fisico" },
      { href: "/escritorio/faltantes", label: "Faltantes", icon: PackageSearch, keywords: "producto inventario reporte" },
      { href: "/escritorio/kudos", label: "Reconocimientos", icon: Award, keywords: "kudos felicitaciones logros" },
      { href: "/escritorio/encuestas", label: "Encuestas", icon: ClipboardList, keywords: "clima feedback opinion" },
      { href: "/escritorio/capacitacion", label: "Capacitación", icon: GraduationCap, keywords: "cursos biblioteca recursos archivos" },
      { href: "/escritorio/datos", label: "Centro de Datos", icon: Database, keywords: "rdv sincronizar excel fuentes sharepoint" },
      { href: "/escritorio/admin", label: "Administración", icon: ShieldCheck, adminOnly: true, keywords: "tiendas usuarios plataforma comisiones suscripcion auditoria" }
    ]
  }
];

/** Lista plana, la que recorre el buscador de la paleta. */
export const navItems: NavItem[] = navGroups.flatMap((group) => group.items);

export const sectionTitles: Record<string, { title: string; subtitle: string }> = {
  "/escritorio": { title: "Dashboard", subtitle: "Resumen operativo de la tienda" },
  "/escritorio/comunicados": { title: "Comunicados", subtitle: "Envía y administra comunicados del equipo" },
  "/escritorio/pendientes": { title: "Pendientes", subtitle: "Handover, responsables y fechas límite" },
  "/escritorio/kpis": { title: "KPIs", subtitle: "Venta, metas y desempeño del equipo" },
  "/escritorio/equipo": { title: "Equipo", subtitle: "Colaboradores y horarios" },
  "/escritorio/horarios": { title: "Horarios", subtitle: "Agenda semanal del equipo" },
  "/escritorio/plan": { title: "Plan del día", subtitle: "Actividades y enfoque del equipo" },
  "/escritorio/checklist": { title: "Checklist de tienda", subtitle: "Apertura y cierre con evidencia" },
  "/escritorio/solicitudes": { title: "Solicitudes", subtitle: "Permisos, turnos y aprobaciones" },
  "/escritorio/faltantes": { title: "Faltantes", subtitle: "Inventario y reportes de producto" },
  "/escritorio/kudos": { title: "Reconocimientos", subtitle: "Reconoce el buen trabajo del equipo" },
  "/escritorio/encuestas": { title: "Encuestas", subtitle: "Clima laboral y feedback del equipo" },
  "/escritorio/datos": { title: "Centro de Datos", subtitle: "Fuentes RDV y sincronización" },
  "/escritorio/bitacora": { title: "Bitácora", subtitle: "Registro cronológico de operación de tienda" },
  "/escritorio/capacitacion": { title: "Capacitación", subtitle: "Biblioteca de recursos y archivos del equipo" },
  "/escritorio/chat": { title: "Chat", subtitle: "Mensajes directos y del equipo" },
  "/escritorio/notificaciones": { title: "Notificaciones", subtitle: "Avisos del equipo" },
  "/escritorio/perfil": { title: "Mi perfil", subtitle: "Tus datos y preferencias" },
  "/escritorio/admin": { title: "Administración", subtitle: "Tiendas, comisiones y suscripciones de la plataforma" },
  "/escritorio/conteos": { title: "Conteos", subtitle: "Inventario físico por marbete" },
  "/escritorio/conteos/marbetes": { title: "Marbetes", subtitle: "Catálogo fijo de tienda y bodega" }
};

/** Título por prefijo para rutas dinámicas (p. ej. /escritorio/conteos/[id]). */
export function resolveSection(pathname: string) {
  if (sectionTitles[pathname]) return sectionTitles[pathname];
  const prefix = Object.keys(sectionTitles)
    .filter((key) => key !== "/escritorio" && pathname.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? sectionTitles[prefix] : { title: "Escritorio", subtitle: "" };
}

/** ¿Es este el elemento activo del rail para la ruta actual? */
export function isActiveNav(pathname: string, href: string) {
  return pathname === href || (href !== "/escritorio" && pathname.startsWith(`${href}/`));
}

/**
 * Normaliza para buscar sin acentos: escribir "capacitacion" debe encontrar
 * "Capacitación". Sin esto la paleta falla justo en las palabras más largas.
 */
export function normalize(value: string) {
  // Se filtra por punto de código en vez de por un rango dentro de una regex.
  // Ese rango escrito con caracteres literales se rompe en silencio si el
  // archivo se reguarda en otra codificación, y la búsqueda dejaría de
  // encontrar justo las palabras con acento. 0x0300–0x036F es el bloque de
  // diacríticos combinantes que NFD deja sueltos.
  return Array.from(value.normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f;
    })
    .join("")
    .toLowerCase()
    .trim();
}
