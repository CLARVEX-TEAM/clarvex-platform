import { NextRequest, NextResponse } from "next/server";
import { canManageDataSources } from "@/lib/access-control";
import { bearerToken, SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/session-token";

const managerRoutes = ["/manager", "/pendientes", "/bitacora", "/comunicados", "/datos", "/escritorio"];
const advisorRoutes = ["/advisor", "/kpis", "/horarios", "/actividad"];
const sharedRoutes = [
  // Diagnóstico del aparato: lo abre cualquiera con sesión, porque el
  // problema que resuelve --«no me llegan los avisos»-- le pasa a cualquiera y
  // no debería depender de que haya un gerente cerca. Solo enseña de qué es
  // capaz el aparato, ningún dato de la tienda ni de personas.
  "/diagnostico",
  // De dónde se baja la app de Android la primera vez. La abre cualquiera con
  // sesión porque todo el equipo tiene que instalarla; lo único de gerencia es
  // el reparto, y eso lo cierra su propio endpoint por rol.
  "/app",
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
  // Restablecer el PIN por correo: por definición se pide SIN poder entrar.
  "/api/auth/pin-reset/request",
  "/api/auth/pin-reset/confirm",
  "/api/auth/biometric/authenticate",
  "/api/auth/biometric/authenticate-options",
  "/api/push/vapid-public-key",
  // ⚠️ **Descarga del APK: sin sesión a propósito, y NO sin autorización.**
  //
  // Quien la pide es el descargador nativo de Android, que va por fuera del
  // WebView y no lleva la cookie. La autorización es un token firmado que solo
  // se emite desde `/api/app/version` --que SÍ exige sesión-- y caduca en diez
  // minutos. El handler lo verifica y responde 401 sin él.
  //
  // Se lista la ruta EXACTA y no el prefijo `/api/app/`: `/api/app/version`
  // tiene que seguir pidiendo sesión, y una ruta futura ahí debajo no puede
  // quedar pública por herencia. Es el mismo criterio que la nota de
  // `/api/admin/sync-source`.
  "/api/app/apk"
]);

/**
 * Rutas de captura manual desde el panel externo. Se enumeran UNA A UNA y no
 * con el prefijo `/api/admin/capture/`: así una ruta futura bajo ese prefijo no
 * queda pública por herencia sin que nadie lo decida.
 */
const captureRoutes = new Set([
  "/api/admin/capture/schedules",
  "/api/admin/capture/attendance",
  // Pase de lista: marca a su hora a quien tenia turno y solo se nombra la
  // excepcion. Escribe asistencia, con el mismo secreto y las mismas reglas.
  "/api/admin/capture/attendance/roll-call",
  "/api/admin/capture/kpis",
  // Objetivos internos (UPT, AUR, EPT, conversion…): los numeros contra los
  // que se pinta el semaforo. NO son las metas de venta, que las siembra la
  // Cuota Justa en `Kpi.dailyGoal`.
  "/api/admin/capture/kpi-targets",
  // Lectura del reporte diario del POS desde una captura. Solo lee y devuelve.
  "/api/admin/capture/kpis/pos-report",
  // Export mensual RDV lleno. Solo lee KPIs y devuelve XLSX en binario/base64.
  "/api/admin/capture/kpis/export",
  "/api/admin/capture/goals",
  "/api/admin/capture/weekly-performance",
  "/api/admin/capture/weekly-performance/export",
  "/api/admin/capture/discounts",
  "/api/admin/capture/electronic-tickets",
  // Kardex de inventario: movimientos (GET/POST) y rondas (abrir/cerrar).
  "/api/admin/capture/inventory",
  "/api/admin/capture/inventory/rounds",
  "/api/admin/capture/inventory/export",
  // Lectura del manifiesto de carga en PDF. Solo lee y devuelve; no escribe.
  "/api/admin/capture/inventory/manifest",
  // Reporte fotografico semanal: lee las fotos que dejo el bot y devuelve el
  // .pptx armado. Mismo secreto que el resto de la captura.
  "/api/admin/capture/visual",
  // Reparte entre sus zonas las fotos que llegaron sin pie, comparandolas con
  // las de la semana pasada. Propone y renombra; no arma nada.
  "/api/admin/capture/visual/reconocer",
  // Inicio gerencial de Retool: solo lectura, autorizado con el mismo secreto.
  "/api/admin/retool/dashboard",
  // Auditoria privada de Retool: solo plataforma, con encabezado server-side.
  "/api/admin/retool/ops"
]);

function isPublicApi(pathname: string): boolean {
  if (publicApiExact.has(pathname)) return true;
  if (pathname.startsWith("/api/cron/")) return true;
  // Sincronización desde el panel externo: no lleva sesión porque no la tiene.
  // Se autoriza con ADMIN_SYNC_SECRET dentro del handler, igual que los cron.
  // Se lista la ruta EXACTA y no el prefijo `/api/admin/`: así una ruta futura
  // bajo ese prefijo no queda pública por herencia.
  if (pathname === "/api/admin/sync-source") return true;
  // Captura manual desde el panel externo. Mismo criterio: rutas EXACTAS, y su
  // propio secreto (ADMIN_CAPTURE_SECRET) validado en cada handler.
  if (captureRoutes.has(pathname)) return true;
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
 * Deja pasar cuatro cosas a propósito:
 *  - `/api/health`, para que Uptime Kuma no dispare alertas falsas durante la
 *    ventana (la app SÍ está sana; solo está cerrada al público).
 *  - Los administradores de plataforma, para poder verificar el despliegue con
 *    la app cerrada al resto.
 *  - El usuario kiosko de la tienda. La apertura y el cierre con evidencia son
 *    operación diaria y una ventana larga los dejaría sin registrar. NO hace
 *    falta enumerar sus rutas aquí: más abajo el middleware ya lo encierra en
 *    `/checklist` (páginas) y en `/api/checklist` + `/api/auth` (APIs).
 *  - El login y `/api/auth/*`. Sin esto, quien cierre sesión o se le caduque
 *    (7 días) queda fuera hasta que alguien entre por SSH — incluido el propio
 *    administrador. Dejarlo abierto no expone nada: el resto de rutas sigue
 *    devolviendo 503, así que quien entre solo verá la página de mantenimiento.
 */
function maintenanceResponse(request: NextRequest, session: Session | null): NextResponse | null {
  if (process.env.MAINTENANCE_MODE !== "1") return null;
  const { pathname } = request.nextUrl;
  if (pathname === "/api/health") return null;
  if (session?.platformAdmin === true) return null;
  if (session?.checklistOnly === true) return null;
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) return null;
  // Captura desde el panel externo. Construir esa captura es justamente el
  // motivo de la ventana, así que cerrarle la puerta la volvería inútil. Va con
  // su propio secreto y es fail-closed, no queda nada abierto.
  if (captureRoutes.has(pathname)) return null;

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
  /*
   * ⚠️ **La cookie primero; la cabecera solo si no hay cookie.**
   *
   * Este es el candado real de `/api/*`: sin él, la app nativa recibiría
   * «Sesión requerida» en cada petición aunque el handler supiera validarla.
   *
   * El orden importa: mirando la cookie primero, la web y Retool siguen el
   * camino exacto de antes y este cambio no puede alterarlos. Ver `bearerToken`
   * en `lib/session-token.ts` para por qué esto no choca con el `Bearer` de los
   * cron ni con el de la captura externa.
   */
  const token = request.cookies.get(SESSION_COOKIE)?.value
    ?? bearerToken(request.headers.get("authorization"));
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
    // Diagnóstico de notificaciones. No enseña datos de nadie --solo lo que el
    // aparato es capaz de hacer-- pero pasa por aquí igual: una pantalla sin
    // sesión es superficie que hay que justificar, y esta no lo necesita.
    "/diagnostico/:path*",
    "/diagnostico",
    "/app",
    "/uniformes/:path*",
    "/solicitudes/:path*",
    "/soporte/:path*"
  ]
};
