import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";

/*
 * Por qué existe esta prueba.
 *
 * `app/globals.css` sube todo el contenido por encima del fondo animado con
 * `@layer base { body > * { position: relative; z-index: 1 } }`. El envoltorio
 * de `PageTransition` es un `<div>` SIN clases, así que esa regla le entra
 * entera y lo convierte en un CONTEXTO DE APILAMIENTO en `z-index: 1`.
 *
 * Dentro de un contexto, un `z-index` solo compite con sus hermanos. La barra
 * de abajo cuelga del `body` y lleva utilidades de Tailwind, que ganan a la
 * capa `base`, así que conserva su `z-30` en la raíz. Resultado: **cualquier
 * `fixed` de una pantalla se pinta DEBAJO de la barra**, por alto que tenga el
 * número --ni `z-[9999]` sale de un contexto de `z-index: 1`--.
 *
 * ⚠️ No da ningún error: se ve como una hoja a la que le falta el último
 * renglón. Se reportó desde un teléfono el 29 de septiembre de 2026, en la
 * hoja de «Priorización & Handover IA» de Pendientes.
 *
 * ⚠️ Comprueba el PATRÓN: cualquier overlay nuevo que no salga al `body` falla
 * nombrando su archivo, incluido el que alguien escriba mañana.
 */

const RAIZ = join(__dirname, "..");
const OVERLAY = /className="[^"]*\bfixed inset-0 z-/;
const SALE_AL_BODY = /createPortal|Dialog\.Portal|<Capa>/;

/*
 * Lo que NO necesita salir al `body`, con su motivo. Una excepción sin motivo
 * es una excepción que nadie se atreve a quitar.
 */
const PERMITIDOS = new Map<string, string>([
  // Cuelgan del `body` porque `app/layout.tsx` los monta ahí: sus utilidades
  // ganan a la capa `base` igual que las de la barra.
  ["components/CandadoHuella.tsx", "montado en el layout raíz"],
  ["components/SplashIntro.tsx", "montado en el layout raíz"],
  ["components/TermsGate.tsx", "montado en el layout raíz"],
  ["components/WhatsNewModal.tsx", "montado en el layout raíz"],
  // Decorativos: van DETRÁS del contenido a propósito. Sacarlos al `body` los
  // pondría por delante, que es justo lo contrario de lo que son.
  ["components/Confetti.tsx", "decorativo, va detrás del contenido"],
  ["components/ParticleBackground.tsx", "decorativo, va detrás del contenido"],
  // Sin montar desde el 26 de agosto de 2026.
  ["components/ClarvexCopilot.tsx", "no se monta en ninguna pantalla"],
  // El escritorio no lleva barra inferior, así que no hay nada que lo tape.
  ["components/desktop/DesktopLock.tsx", "solo escritorio, sin barra"],
  ["app/escritorio/chat/page.tsx", "solo escritorio, sin barra"],
  ["app/escritorio/kpis/page.tsx", "solo escritorio, sin barra"],
  ["app/escritorio/pendientes/page.tsx", "solo escritorio, sin barra"],
  // `/chat/<id>` no está en ROUTES_WITH_NAV: el detalle de una conversación no
  // pinta barra.
  ["app/chat/[id]/page.tsx", "ruta sin barra inferior"],
  ["components/ChatPicker.tsx", "solo se usa desde /chat/<id> y el escritorio"],
  ["components/FichaCompanero.tsx", "solo se usa desde /chat/<id>"],
]);

function archivos(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada === ".next" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) archivos(ruta, salida);
    else if (entrada.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

function conOverlay(): string[] {
  const out: string[] = [];
  for (const carpeta of ["app", "components"]) {
    for (const ruta of archivos(join(RAIZ, carpeta))) {
      const codigo = readFileSync(ruta, "utf8");
      if (!OVERLAY.test(codigo)) continue;
      if (SALE_AL_BODY.test(codigo)) continue;
      out.push(relative(RAIZ, ruta).split(sep).join("/"));
    }
  }
  return out.sort();
}

test("todo overlay de pantalla sale al body, o está justificado", () => {
  const sueltos = conOverlay().filter((f) => !PERMITIDOS.has(f));
  assert.deepEqual(
    sueltos,
    [],
    `estos overlays se pintarán DEBAJO de la barra de abajo. Envuélvelos en <Capa> ` +
      `(components/Capa.tsx), o añádelos a PERMITIDOS con su motivo: ${sueltos.join(" | ")}`
  );
});

test("la regla que causa esto sigue en globals.css", () => {
  /*
   * Si algún día desaparece `body > *`, esta prueba y el envoltorio dejan de
   * hacer falta. Que falle aquí es la señal de ir a revisarlo, no un fallo:
   * mantener un andamio cuyo motivo ya no existe es como se acumula el código
   * que nadie se atreve a tocar.
   */
  const css = readFileSync(join(RAIZ, "app", "globals.css"), "utf8");
  assert.match(
    css,
    /body\s*>\s*\*\s*\{[^}]*z-index:\s*1/,
    "ya no está `body > * { z-index: 1 }`: revisa si <Capa> sigue haciendo falta"
  );
});

test("Capa hace portal al body y espera al montaje", () => {
  const capa = readFileSync(join(RAIZ, "components", "Capa.tsx"), "utf8");
  assert.match(capa, /createPortal\(children, document\.body\)/);
  // Sin esperar al montaje, el primer render del cliente no coincide con el del
  // servidor y la hidratación falla.
  assert.match(capa, /if \(!montada/);
});
