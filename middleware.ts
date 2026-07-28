import { NextRequest, NextResponse } from "next/server";
import { canManageDataSources } from "@/lib/access-control";
import { SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/session-token";

const managerRoutes = ["/manager", "/pendientes", "/bitacora", "/comunicados", "/datos", "/escritorio"];
const advisorRoutes = ["/advisor", "/kpis", "/horarios", "/actividad"];
const sharedRoutes = [
  "/plan",
  "/kpis",
  "/horarios",
  "/perfil",
  "/notificaciones",
  "/pendientes",
  "/comunicados",
  "/chat",
  "/conteos",
  "/equipo",
  "/encuestas",
  "/checklist",
  "/suscripcion",
  "/suspendida",
  "/faltantes",
  "/kudos",
  "/capacitacion",
  "/asistencia",
  "/uniformes",
  "/solicitudes",
  "/escritorio",
  "/bitacora",
  "/soporte"
];

/** Rutas API públicas (sin cookie de sesión). Cron/webhooks usan su propio secreto. */
const publicApiExact = new Set([
  "/api/health",
  "/api/version",
  "/api/auth/employee-login",
  "/api/auth/session",
  "/api/auth/biometric/authenticate",
  "/api/auth/biometric/authenticate-options",
  "/api/push/vapid-public-key"
]);

function isPublicApi(pathname: string): boolean {
  if (publicApiExact.has(pathname)) return true;
  if (pathname.startsWith("/api/cron/")) return true;
  if (pathname.startsWith("/api/webhooks/")) return true;
  // Entrada pública al modo demo (crea la sesión demo; rate-limitada en el handler).
  if (pathname.startsWith("/api/demo/")) return true;
  return false;
}

function startsWithRoute(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Ventana de mantenimiento. Se activa poniendo MAINTENANCE_MODE=1 en el .env y
 * reiniciando con `pm2 restart clarvex-team --update-env`.
 *
 * Deja pasar dos cosas a propósito:
 *  - `/api/health`, para que Uptime Kuma no dispare alertas falsas durante la
 *    ventana (la app SÍ está sana; solo está cerrada al público).
 *  - Los administradores de plataforma, para poder verificar el despliegue con
 *    la app cerrada al resto.
 */
function maintenanceResponse(request: NextRequest, session: Session | null): NextResponse | null {
  if (process.env.MAINTENANCE_MODE !== "1") return null;
  const { pathname } = request.nextUrl;
  if (pathname === "/api/health") return null;
  if (session?.platformAdmin === true) return null;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "En mantenimiento. Volvemos en unos minutos." },
      { status: 503, headers: { "Retry-After": "600" } }
    );
  }
  // Rewrite (no redirect): la URL del usuario no cambia, así que al terminar la
  // ventana basta con recargar. /mantenimiento no está en el matcher: no hay bucle.
  return NextResponse.rewrite(new URL("/mantenimiento", request.url), {
    status: 503,
    headers: { "Retry-After": "600" }
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const maintenance = maintenanceResponse(request, session);
  if (maintenance) return maintenance;

  // API: gate global con allowlist pública. Los handlers siguen haciendo
  // requireSession / requireCron / roles (sessionVersion, store, etc.).
  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname)) return NextResponse.next();
    if (!session) {
      return NextResponse.json({ error: "Sesion requerida." }, { status: 401 });
    }
    // Usuario kiosko: solo las APIs del checklist (y auth/sesión). Cualquier otra
    // se corta aquí, además de que los handlers ya validan rol.
    if (session.checklistOnly && !pathname.startsWith("/api/checklist") && !pathname.startsWith("/api/auth/")) {
      return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
    }
    // Sesión DEMO: SOLO LECTURA. Cualquier método que cambie estado se corta aquí
    // (se permite /api/auth para poder cerrar la sesión demo). Es el candado real.
    if (session.demo && request.method !== "GET" && !pathname.startsWith("/api/auth/")) {
      return NextResponse.json({ error: "Modo demostración: solo lectura." }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (!session) return NextResponse.next();
    if (session.checklistOnly) return NextResponse.redirect(new URL("/checklist", request.url));
    if (session.role === "REGIONAL") {
      return NextResponse.redirect(new URL("/regional", request.url));
    }
    return NextResponse.redirect(new URL(session.role === "ASESOR" ? "/advisor" : "/manager", request.url));
  }

  if (pathname === "/") {
    if (!session) return NextResponse.redirect(new URL("/login", request.url));
    if (session.checklistOnly) return NextResponse.redirect(new URL("/checklist", request.url));
    if (session.role === "REGIONAL") return NextResponse.redirect(new URL("/regional", request.url));
    return NextResponse.redirect(new URL(session.role === "ASESOR" ? "/advisor" : "/manager", request.url));
  }

  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  // Usuario kiosko de la tienda: encerrado en /checklist. Cualquier otra página
  // lo devuelve ahí. Es la protección real (no basta esconder botones).
  if (session.checklistOnly) {
    if (startsWithRoute(pathname, ["/checklist"])) return NextResponse.next();
    return NextResponse.redirect(new URL("/checklist", request.url));
  }
  const isRegional = session.role === "REGIONAL";
  const isManager = session.role === "GERENTE" || session.role === "SUBGERENTE";
  const isPlatformAdmin = session.platformAdmin === true;

  if (startsWithRoute(pathname, ["/admin"])) {
    if (isPlatformAdmin) return NextResponse.next();
    if (isRegional) return NextResponse.redirect(new URL("/regional", request.url));
    return NextResponse.redirect(new URL(isManager ? "/manager" : "/advisor", request.url));
  }
  if (startsWithRoute(pathname, ["/datos"]) && !canManageDataSources(session.role) && !isPlatformAdmin) {
    return NextResponse.redirect(new URL(isRegional ? "/regional" : "/advisor", request.url));
  }
  const allowed = isPlatformAdmin
    || startsWithRoute(pathname, sharedRoutes)
    || (isRegional && startsWithRoute(pathname, ["/regional"]))
    || (isManager && startsWithRoute(pathname, managerRoutes))
    || (!isManager && !isRegional && startsWithRoute(pathname, advisorRoutes));

  if (!allowed) {
    if (isRegional) return NextResponse.redirect(new URL("/regional", request.url));
    return NextResponse.redirect(new URL(isManager ? "/manager" : "/advisor", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/api/:path*",
    "/admin/:path*",
    "/manager/:path*",
    "/advisor/:path*",
    "/regional/:path*",
    "/pendientes/:path*",
    "/bitacora/:path*",
    "/comunicados/:path*",
    "/datos/:path*",
    "/escritorio/:path*",
    "/plan/:path*",
    "/kpis/:path*",
    "/horarios/:path*",
    "/perfil/:path*",
    "/notificaciones/:path*",
    "/actividad/:path*",
    "/chat/:path*",
    "/conteos/:path*",
    "/equipo/:path*",
    "/encuestas/:path*",
    "/checklist/:path*",
    "/suscripcion/:path*",
    "/suspendida/:path*",
    "/faltantes/:path*",
    "/kudos/:path*",
    "/capacitacion/:path*",
    "/asistencia/:path*",
    "/uniformes/:path*",
    "/solicitudes/:path*",
    "/soporte/:path*"
  ]
};
