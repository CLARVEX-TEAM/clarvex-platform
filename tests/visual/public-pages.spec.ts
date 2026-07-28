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
const HIDE_ANIMATED_BACKGROUND = `
  .meteors, .dot-pattern { display: none !important; }
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
  await page.goto(path);
  await page.addStyleTag({ content: HIDE_ANIMATED_BACKGROUND });
  // Esperar a la fuente evita capturas con el tipo de letra de reserva.
  await page.evaluate(() => document.fonts.ready);
  return page.locator("main").first();
}

test.describe("pantallas públicas", () => {
  test("login", async ({ page }) => {
    const main = await prepare(page, "/login");
    await expect(main).toHaveScreenshot("login.png");
  });

  test("mantenimiento", async ({ page }) => {
    const main = await prepare(page, "/mantenimiento");
    await expect(main).toHaveScreenshot("mantenimiento.png");
  });
});

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
