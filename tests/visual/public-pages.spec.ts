import { expect, test } from "@playwright/test";

/**
 * Regresión visual de las pantallas públicas.
 *
 * Son las únicas que renderizan sin base de datos, así que son las únicas que
 * el CI puede cubrir hoy. Aun así atrapan la clase de fallo que se nos escapó
 * durante el rediseño: tokens de color rotos, un efecto que no llega al CSS,
 * o algo que se ve bien en claro y mal en oscuro.
 */

// Se ocultan los DOS fondos, y por motivos distintos:
//
//  - `.meteors` se mueve en bucle: sin ocultarlo, cada captura sale distinta.
//  - `.dot-pattern` no se mueve, pero es `position: fixed`, y en una captura de
//    página completa un elemento fijo se desplaza con el scroll mientras
//    Playwright compone la imagen. La captura nunca se estabiliza y la prueba
//    agota el tiempo en vez de fallar por una diferencia real.
// `[data-transient]` marca los avisos flotantes cuya aparición depende del
// estado del navegador —hay versión nueva, sin conexión, activar push— y no del
// diseño. Sin ocultarlos, la misma pantalla se captura distinta en cada
// ejecución según lo que decida el service worker.
const HIDE_ANIMATED_BACKGROUND = `
  .meteors, .dot-pattern, [data-transient] { display: none !important; }
  *, *::before, *::after {
    animation-play-state: paused !important;
    transition: none !important;
  }
`;

/**
 * Se captura el `<main>` y NO la ventana completa. Es la diferencia entre una
 * prueba fiable y una que falla sola:
 *
 *  - `SplashIntro` es `fixed inset-0` y tapa la pantalla entera mientras dura.
 *    Según el momento del arranque salía en la captura o no, y con eso el 84%
 *    de los píxeles cambiaba entre corridas.
 *  - Los avisos flotantes (instalar PWA, sin conexión, actualización) aparecen
 *    según el estado del navegador y movían la altura de la imagen unos píxeles.
 *
 * Acotando al contenido, la prueba vigila lo que de verdad interesa —
 * maquetación, tipografía y color— y deja fuera el ruido del entorno.
 */
async function prepare(page: import("@playwright/test").Page, path: string) {
  // El intro de apertura (SplashIntro) cubre la pantalla entera durante 2,5 s y
  // se muestra una vez por sesión. Cada prueba abre un contexto nuevo, así que
  // salía SIEMPRE, y ocultarlo después de navegar no servía: se monta más tarde
  // que la limpieza. Marcarlo como ya visto ANTES de navegar es lo único que lo
  // evita de forma fiable. Es la misma marca que usa la app en producción.
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("clarvex-splash", "1");
    } catch {
      /* sin sessionStorage: nada que hacer */
    }
  });

  await page.goto(path);
  await page.addStyleTag({ content: HIDE_ANIMATED_BACKGROUND });

  // Ocultar TODO lo que esté en `position: fixed`, no solo lo etiquetado.
  //
  // Etiquetar componentes uno a uno no bastaba: quedaban el intro de apertura
  // (cubre la pantalla ~2,4 s), el aviso de términos, el de modo demo... y cada
  // uno aparece según el estado del navegador. La captura salía distinta en
  // cada ejecución y la prueba fallaba una de cada dos veces sin que hubiera
  // cambiado nada del diseño.
  //
  // Es seguro en estas dos pantallas porque NINGÚN elemento fijo forma parte de
  // su diseño: no llevan barra inferior ni cabecera flotante. En una pantalla
  // que sí los tenga, habría que excluirlos de esta limpieza.
  await page.evaluate(() => {
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      if (getComputedStyle(el).position === "fixed") el.style.display = "none";
    }
  });

  // Esperar a la fuente evita capturas con el tipo de letra de reserva.
  await page.evaluate(() => document.fonts.ready);
  return page.locator("main").first();
}

/**
 * ⚠️ COMPARACIÓN DE CAPTURAS: RETIRADA POR AHORA.
 *
 * Se intentó y no se consiguió estabilizar. Ocho enfoques: capturar `main` en
 * vez de la ventana, separar referencias por proyecto, ocultar los fondos
 * animados, calibrar el umbral, emular `prefers-reduced-motion`, ocultar todo
 * lo que esté en `position: fixed`, saltar el splash por sessionStorage y
 * añadir un reintento. Cada uno bajó la tasa de fallo; ninguno la eliminó.
 *
 * La causa no es de configuración: la app tiene mucha actividad en el cliente
 * (service worker, avisos de PWA, framer-motion, intro de apertura) y Playwright
 * exige dos capturas consecutivas idénticas. Estabilizarla de verdad requiere un
 * MODO DE PRUEBAS en el build que apague todo eso — trabajo aparte, no un ajuste.
 *
 * Una prueba que falla la mitad de las veces es peor que ninguna: enseña a
 * ignorar el rojo. Por eso se retira en lugar de dejarse en verde a base de
 * subir la tolerancia, que es lo que la volvería incapaz de detectar nada.
 *
 * Lo que queda abajo SÍ es determinista y cubre los fallos reales que se
 * colaron durante el rediseño.
 */

/**
 * Se vigilan las excepciones de JavaScript sin capturar, NO los errores de
 * consola en general: en una pantalla pública la app consulta APIs sin sesión y
 * recibe 401, que es el comportamiento correcto. Exigir la consola limpia
 * marcaba esos 401 como fallo y la prueba no servía para nada.
 *
 * Una excepción sin capturar sí es siempre un defecto: significa que algo
 * reventó al renderizar.
 */
for (const ruta of ["/login", "/mantenimiento"]) {
  test(`${ruta} renderiza sin excepciones`, async ({ page }) => {
    const fallos: string[] = [];
    page.on("pageerror", (err) => fallos.push(err.message));

    const main = await prepare(page, ruta);
    await expect(main).toBeVisible();

    expect(fallos, `excepciones: ${fallos.join(" | ")}`).toHaveLength(0);
  });
}

/**
 * Comprobaciones que no dependen de una imagen de referencia: se pueden correr
 * en cualquier sistema operativo y fallan por una razón concreta, no por una
 * diferencia de píxeles. Cubren exactamente los dos fallos reales de hoy.
 */
test.describe("tokens y efectos", () => {
  test("los tokens de color producen colores válidos, no canales sueltos", async ({ page }) => {
    await page.goto("/login");
    const color = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.className = "text-ink";
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    });
    // Si `--color-ink` valiera "23 24 28" (canales sin envolver en rgb()), el
    // navegador descartaría la declaración y esto no sería un color resuelto.
    // Es el fallo que la migración a Tailwind v4 habría desplegado en silencio.
    expect(color).toMatch(/^rgba?\(/);
    expect(color).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("los keyframes de los efectos llegan al CSS servido", async ({ page }) => {
    await page.goto("/login");
    const found = await page.evaluate(() => {
      const names = new Set<string>();
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // hoja de otro origen
        }
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSKeyframesRule) names.add(rule.name);
        }
      }
      return Array.from(names);
    });

    // Un @keyframes puede desaparecer del bundle sin que el build proteste: es
    // lo que dejó el BorderBeam invisible. Aquí sí falla.
    for (const name of ["meteor-fall", "gradient-sweep", "beam-spin", "shine-border"]) {
      expect(found, `falta el keyframe ${name}`).toContain(name);
    }
  });

  test("el fondo animado no captura toques", async ({ page }) => {
    await page.goto("/login");
    const pointerEvents = await page.evaluate(() => {
      const node = document.querySelector(".meteors");
      return node ? getComputedStyle(node).pointerEvents : "sin-meteoros";
    });
    // Un fondo a pantalla completa que capture toques bloquea la app entera.
    expect(["none", "sin-meteoros"]).toContain(pointerEvents);
  });
});
