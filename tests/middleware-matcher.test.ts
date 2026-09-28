import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/*
 * `middleware.ts` tiene DOS listas blancas y hacen trabajos distintos:
 *
 *   - el `matcher` decide si el middleware CORRE para esa ruta;
 *   - `sharedRoutes` / `managerRoutes` / `advisorRoutes` deciden si DEJA PASAR.
 *
 * Una pantalla nueva tiene que estar en las dos, y estar solo en la primera es
 * peor que no estar en ninguna: el middleware corre, no la reconoce y redirige
 * a /manager. El sintoma —una redireccion— no se parece en nada a un permiso
 * mal puesto, asi que se investiga donde no es.
 *
 * Las dos cosas pasaron de verdad el 31 de agosto de 2026 con una pantalla
 * nueva, y ninguna se veia leyendo el codigo: se vieron pidiendo la pagina.
 *
 * Es el mismo precio que ya se paga en `captureRoutes`: enumerar una a una es
 * deliberado, pero obliga a que algo avise cuando falta una.
 */

const RAIZ = join(__dirname, "..");

/**
 * Pantallas publicas a proposito: se ven SIN sesion.
 *
 * Anadir aqui es una decision de seguridad, no un tramite. Si una pantalla
 * nueva ensena datos de tienda, no va en esta lista: va en el matcher.
 */
const PUBLICAS = new Set([
  "login",
  "recuperar",
  "reset",
  "mantenimiento",
  // Legales y de producto: existen para poder leerlas sin cuenta.
  "cookies",
  "legal",
  "politica-privacidad",
  "privacidad",
  "reembolsos",
  "seguridad",
  "terminos",
  "uso-aceptable",
  /*
   * ⚠️ Maqueta de diseño, sin sesión y sin datos reales: todo lo que enseña
   * --nombres, tienda, cifras-- está inventado en el propio archivo. Entró en
   * el PR 131 sin pasar por el matcher, así que YA es pública; esto solo deja
   * escrita esa decisión en vez de que quede por descuido.
   *
   * Si alguna vez llega a leer datos de verdad, tiene que salir de esta lista y
   * entrar al matcher Y a una lista de permitidas -- solo al matcher redirige,
   * que es el fallo que costó la credencial.
   */
  "concepto",
  /*
   * La pagina de producto. Es publica A PROPOSITO y esa es toda su razon de
   * ser: quien llega de fuera tiene que ver que hace Clarvex Team sin pedir
   * cuenta a nadie.
   *
   * No ensena ni un dato de tienda. Las capturas que lleva son de la demo
   * publica --tienda `demo-showcase`, datos ficticios-- y estan servidas como
   * imagenes estaticas desde `public/`, no consultando nada.
   */
  "producto"
]);

/** Las que el middleware resuelve por su cuenta, antes de mirar las listas. */
const CON_REGLA_PROPIA = new Set([
  "",
  "login",
  "admin",
  "regional",
  "mantenimiento",
  "suspendida",
  "suscripcion"
]);

function rutasDeLaApp(): string[] {
  return readdirSync(join(RAIZ, "app"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "api")
    // Los grupos de rutas `(algo)` no son segmentos de URL.
    .filter((e) => !e.name.startsWith("(") && !e.name.startsWith("_"))
    .filter((e) => existsSync(join(RAIZ, "app", e.name, "page.tsx")))
    .map((e) => e.name);
}

const FUENTE = readFileSync(join(RAIZ, "middleware.ts"), "utf8");

function matcherDelMiddleware(): string[] {
  const bloque = /export const config = \{[\s\S]*?matcher: \[([\s\S]*?)\]/.exec(FUENTE);
  assert.ok(bloque, "no se encontro el matcher en middleware.ts");
  return [...bloque[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function rutasPermitidas(): Set<string> {
  const permitidas = new Set<string>();
  for (const lista of ["managerRoutes", "advisorRoutes", "sharedRoutes"]) {
    const bloque = new RegExp(`const ${lista} = \\[([\\s\\S]*?)\\];`).exec(FUENTE);
    assert.ok(bloque, `no se encontro ${lista} en middleware.ts`);
    for (const m of bloque[1].matchAll(/"([^"]+)"/g)) permitidas.add(m[1].split("/")[1]);
  }
  return permitidas;
}

/** Primer segmento de cada patron del matcher: "/x" y "/x/:path*" dan "x". */
function cubiertasPorElMatcher(): Set<string> {
  return new Set(
    matcherDelMiddleware()
      .map((p) => p.split("/")[1])
      .filter((s) => s && !s.startsWith(":"))
  );
}

test("toda pantalla esta en el matcher o declarada publica", () => {
  const cubiertas = cubiertasPorElMatcher();
  const huerfanas = rutasDeLaApp().filter((r) => !cubiertas.has(r) && !PUBLICAS.has(r));

  assert.deepEqual(
    huerfanas,
    [],
    `Estas pantallas no pasan por el middleware y no estan declaradas publicas: ${huerfanas.join(", ")}. ` +
      "Anadelas al matcher de middleware.ts, o a PUBLICAS si de verdad se ven sin sesion."
  );
});

test("toda pantalla del matcher tambien esta permitida para alguien", () => {
  const permitidas = rutasPermitidas();
  const cubiertas = cubiertasPorElMatcher();

  const inalcanzables = rutasDeLaApp()
    .filter((r) => !PUBLICAS.has(r) && !CON_REGLA_PROPIA.has(r))
    .filter((r) => cubiertas.has(r))
    .filter((r) => !permitidas.has(r));

  assert.deepEqual(
    inalcanzables,
    [],
    `Estas pantallas pasan por el middleware pero ninguna lista las permite, asi que redirigen: ${inalcanzables.join(", ")}. ` +
      "Anadelas a sharedRoutes, managerRoutes o advisorRoutes en middleware.ts."
  );
});

test("una ruta hermana no se da por cubierta por su vecina", () => {
  /*
   * Guarda del propio test. `startsWithRoute` compara por SEGMENTO, asi que
   * «/chat» no cubre «/chat-algo». Si esta comparacion fuera por prefijo, una
   * pantalla nueva pasaria por parecerse a otra y el test diria que todo esta
   * bien mientras el agujero sigue abierto.
   */
  const porSegmento = (ruta: string, patron: string) => ruta === patron.split("/")[1];
  assert.ok(porSegmento("chat", "/chat/:path*"));
  assert.ok(!porSegmento("chat-algo", "/chat/:path*"));
});

test("el middleware compara rutas por segmento, no por prefijo", () => {
  // Si esto cambiara a un `startsWith` pelado, «/chat-algo» heredaria los
  // permisos de «/chat» sin que nadie lo decidiera.
  const fn = /function startsWithRoute[\s\S]*?\n\}/.exec(FUENTE);
  assert.ok(fn, "no se encontro startsWithRoute");
  assert.match(fn[0], /pathname === route/);
  assert.match(fn[0], /startsWith\(`\$\{route\}\/`\)/);
});
