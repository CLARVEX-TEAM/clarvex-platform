import { NextRequest, NextResponse } from "next/server";
import { canManageDataSources } from "@/lib/access-control";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";

const managerRoutes = ["/manager", "/pendientes", "/bitacora", "/comunicados", "/datos", "/escritorio"];
const advisorRoutes = ["/advisor", "/kpis", "/horarios", "/actividad"];
const sharedRoutes = ["/plan", "/kpis", "/horarios", "/perfil", "/notificaciones", "/pendientes", "/comunicados"];

function startsWithRoute(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (pathname === "/login") {
    if (!session) return NextResponse.next();
    if (session.role === "REGIONAL") {
      return NextResponse.redirect(new URL("/regional", request.url));
    }
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
  matcher: ["/login", "/admin/:path*", "/manager/:path*", "/advisor/:path*", "/regional/:path*", "/pendientes/:path*", "/bitacora/:path*", "/comunicados/:path*", "/datos/:path*", "/escritorio/:path*", "/plan/:path*", "/kpis/:path*", "/horarios/:path*", "/perfil/:path*", "/notificaciones/:path*", "/actividad/:path*"]
};
