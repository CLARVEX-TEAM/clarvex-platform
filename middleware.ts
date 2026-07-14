import { NextRequest, NextResponse } from "next/server";
import { canManageDataSources } from "@/lib/access-control";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";

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
  "/mundial",
  "/partido",
  "/suscripcion",
  "/suspendida",
  "/faltantes",
  "/kudos",
  "/capacitacion",
  "/asistencia",
  "/solicitudes",
  "/escritorio",
  "/bitacora"
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
  return false;
}

function startsWithRoute(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  // API: gate global con allowlist pública. Los handlers siguen haciendo
  // requireSession / requireCron / roles (sessionVersion, store, etc.).
  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname)) return NextResponse.next();
    if (!session) {
      return NextResponse.json({ error: "Sesion requerida." }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (!session) return NextResponse.next();
    if (session.role === "REGIONAL") {
      return NextResponse.redirect(new URL("/regional", request.url));
    }
    return NextResponse.redirect(new URL(session.role === "ASESOR" ? "/advisor" : "/manager", request.url));
  }

  if (pathname === "/") {
    if (!session) return NextResponse.redirect(new URL("/login", request.url));
    if (session.role === "REGIONAL") return NextResponse.redirect(new URL("/regional", request.url));
    return NextResponse.redirect(new URL(session.role === "ASESOR" ? "/advisor" : "/manager", request.url));
  }

  if (!session) return NextResponse.redirect(new URL("/login", request.url));
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
    "/mundial/:path*",
    "/partido/:path*",
    "/suscripcion/:path*",
    "/suspendida/:path*",
    "/faltantes/:path*",
    "/kudos/:path*",
    "/capacitacion/:path*",
    "/asistencia/:path*",
    "/solicitudes/:path*"
  ]
};
