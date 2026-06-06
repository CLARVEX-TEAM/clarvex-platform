import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";

const managerRoutes = ["/manager", "/pendientes", "/bitacora", "/comunicados"];
const advisorRoutes = ["/advisor", "/kpis", "/horarios", "/actividad"];
const sharedRoutes = ["/plan", "/kpis", "/horarios"];

function startsWithRoute(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (pathname === "/login") {
    if (!session) return NextResponse.next();
    return NextResponse.redirect(new URL(session.role === "ASESOR" ? "/advisor" : "/manager", request.url));
  }

  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  const isManager = session.role === "GERENTE" || session.role === "SUBGERENTE";
  const allowed = startsWithRoute(pathname, sharedRoutes)
    || (isManager && startsWithRoute(pathname, managerRoutes))
    || (!isManager && startsWithRoute(pathname, advisorRoutes));

  if (!allowed) {
    return NextResponse.redirect(new URL(isManager ? "/manager" : "/advisor", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/manager/:path*", "/advisor/:path*", "/pendientes/:path*", "/bitacora/:path*", "/comunicados/:path*", "/plan/:path*", "/kpis/:path*", "/horarios/:path*", "/actividad/:path*"]
};
