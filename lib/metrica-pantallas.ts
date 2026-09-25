/**
 * Qué pantalla se apunta cuando alguien abre una, y cuál no se apunta.
 *
 * POR QUÉ EXISTE: el 24 de septiembre de 2026 se midió el uso de la app con lo
 * que la base guardaba de casualidad y **salió mal**. Lo que se contó fueron
 * ESCRITURAS --un conteo deja fila, un checklist deja fila-- así que todo lo que
 * se lee sin tocar nada aparecía en cero. Se cerraron quince pantallas y en
 * menos de un día la gerente preguntó en la tienda por qué ya no le salían.
 *
 * ⚠️ **Leer no deja rastro, y por eso hay que apuntarlo a propósito.** El chat
 * es el ejemplo caro: 15 mensajes escritos por dos personas, pero 55 mensajes
 * LEÍDOS por cinco. Con el primer número parecía muerto; con el segundo es un
 * tablón que mira todo el equipo.
 *
 * Aquí viven solo las decisiones, sin Prisma y sin red, que es lo único que se
 * puede probar. Lo mismo que `lib/cola-offline.ts` y `lib/portada.ts`.
 */

/**
 * Pantallas que NO se apuntan, y el motivo de cada grupo.
 *
 * ⚠️ **Las públicas se quedan fuera porque no hay a quién contar.** `/login` y
 * `/v/<token>` se abren SIN sesión --la credencial la escanea un desconocido con
 * una cámara--, así que apuntarlas mediría visitas anónimas mezcladas con el uso
 * del equipo, que es justo lo que se quiere separar.
 *
 * ⚠️ **Y la raíz tampoco**, porque no es una pantalla: `app/page.tsx` solo
 * reparte hacia la portada que toca. Contarla sería contar dos veces cada
 * arranque de la app.
 */
const NO_SE_APUNTAN = new Set([
  "/",
  "/login",
  "/recuperar",
  "/reset",
  "/mantenimiento",
  "/suspendida",
  // Páginas de marketing y legales: las ve quien no trabaja aquí.
  "/producto",
  "/legal",
  "/terminos",
  "/privacidad",
  "/politica-privacidad",
  "/cookies",
  "/uso-aceptable",
  "/reembolsos",
  "/seguridad"
]);

/**
 * Rutas con un trozo variable, y el nombre con el que se apuntan.
 *
 * ⚠️ **Sin esto la métrica no sirve para nada.** Cada conteo tiene su propio id,
 * así que `/conteos/a1b2` y `/conteos/c3d4` serían dos «pantallas» distintas:
 * al mes habría cientos de filas con una visita cada una y ninguna forma de
 * responder la única pregunta que importa --cuánta gente abre el detalle de un
 * conteo--. Se normalizan al patrón, igual que Next nombra sus carpetas.
 *
 * Lista explícita y no un prefijo, por la misma razón que `ROUTES_WITH_NAV`:
 * hay pares que se parecen y no son lo mismo. `/conteos/marbetes` es una
 * pantalla propia y `/conteos/<id>` es el detalle de un conteo.
 */
const CON_PARTE_VARIABLE: { patron: RegExp; nombre: string }[] = [
  { patron: /^\/conteos\/marbetes\/imprimir$/, nombre: "/conteos/marbetes/imprimir" },
  { patron: /^\/conteos\/marbetes$/, nombre: "/conteos/marbetes" },
  { patron: /^\/conteos\/dama$/, nombre: "/conteos/dama" },
  { patron: /^\/conteos\/[^/]+$/, nombre: "/conteos/[id]" },
  { patron: /^\/escritorio\/conteos\/marbetes$/, nombre: "/escritorio/conteos/marbetes" },
  { patron: /^\/escritorio\/conteos\/dama$/, nombre: "/escritorio/conteos/dama" },
  { patron: /^\/escritorio\/conteos\/[^/]+$/, nombre: "/escritorio/conteos/[id]" },
  { patron: /^\/chat\/[^/]+$/, nombre: "/chat/[id]" },
  { patron: /^\/soporte\/[^/]+$/, nombre: "/soporte/[id]" },
  { patron: /^\/checklist\/config$/, nombre: "/checklist/config" },
  { patron: /^\/team\/[^/]+$/, nombre: "/team/[id]" }
];

/**
 * La ruta tal como se apunta, o `null` si esta pantalla no se mide.
 *
 * ⚠️ **Lo que llega del cliente NO se guarda tal cual.** `pathname` lo manda el
 * navegador y acabaría siendo una columna de texto libre en la base: basta un
 * `?token=` mal cortado o una ruta inventada para meter ahí algo que nadie
 * quería guardar. Solo salen de aquí nombres de esta lista o de la de patrones.
 */
export function rutaMedible(pathname: string | null | undefined): string | null {
  if (typeof pathname !== "string") return null;

  // Sin consulta ni ancla: `?desde=aviso` no hace otra pantalla.
  const limpia = pathname.split("?")[0].split("#")[0];
  if (!limpia.startsWith("/")) return null;

  // La barra final no distingue nada: `/kpis/` es `/kpis`.
  const ruta = limpia.length > 1 && limpia.endsWith("/") ? limpia.slice(0, -1) : limpia;

  if (NO_SE_APUNTAN.has(ruta)) return null;
  // `/v/<token>` y `/recuperar/<token>` se abren sin sesión; ver arriba.
  if (ruta.startsWith("/v/") || ruta.startsWith("/recuperar/")) return null;
  // Nada que no sea una pantalla.
  if (ruta.startsWith("/api/") || ruta.startsWith("/_next/")) return null;

  for (const { patron, nombre } of CON_PARTE_VARIABLE) {
    if (patron.test(ruta)) return nombre;
  }

  // Una pantalla sin parte variable se apunta con su propia ruta, pero solo si
  // de verdad es una sola pieza: un segundo segmento que no esté arriba es una
  // ruta que nadie declaró, y guardarla sería aceptar texto libre.
  const segmentos = ruta.split("/").filter(Boolean);
  if (segmentos.length === 1) return ruta;
  if (segmentos.length === 2 && segmentos[0] === "escritorio") return ruta;
  return null;
}

/**
 * De dónde se abrió, para poder separar la APK de la web.
 *
 * ⚠️ **Se compara el PREFIJO `ClarvexApp/`, nunca la versión**, por lo mismo que
 * `enContenedorNativo`: cada APK escribe la suya, y buscar una exacta dejaría
 * fuera a los teléfonos sin actualizar --que son justo los que no se arreglan
 * publicando una APK nueva--.
 */
export function desdeDondeSeAbrio(userAgent: string | null | undefined): "apk" | "web" {
  return typeof userAgent === "string" && userAgent.includes("ClarvexApp/") ? "apk" : "web";
}

/**
 * Cuántas visitas de una misma pantalla se apuntan seguidas.
 *
 * ⚠️ **Volver a la pantalla anterior NO es una visita nueva si fue hace un
 * instante.** React vuelve a pintar, el usuario gira el teléfono, una
 * navegación se repite: sin este freno una persona que entra y sale de Conteos
 * cinco veces en un minuto pesaría lo mismo que cinco personas usándola. Lo que
 * se quiere contar es «la abrió», no «el componente se montó».
 *
 * Treinta segundos: suficiente para tragarse un rebote y corto para que dos
 * consultas de verdad seguidas cuenten las dos.
 */
export const REPETICION_MINIMA_MS = 30_000;

export function seApunta(
  ruta: string,
  ultima: { ruta: string; cuando: number } | null,
  ahora: number
): boolean {
  if (!ultima) return true;
  if (ultima.ruta !== ruta) return true;
  return ahora - ultima.cuando >= REPETICION_MINIMA_MS;
}
