import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de regresión visual.
 *
 * Por qué existen: durante el rediseño, TODOS los fallos visuales se
 * descubrieron mandando capturas del móvil por chat — un efecto que no se veía,
 * otro aplicado en la pantalla equivocada. El build, el lint y los 403 tests
 * pasaban en verde mientras tanto. Nada de eso mira píxeles.
 *
 * ALCANCE ACTUAL: comprobaciones DETERMINISTAS sobre las pantallas públicas —
 * las únicas que renderizan sin base de datos, porque el CI no levanta Postgres.
 *
 * ⚠️ La comparación de capturas se intentó y se retiró: no se consiguió
 * estabilizar (ver el comentario largo en tests/visual/public-pages.spec.ts).
 * Lo que queda no compara píxeles, pero sí atrapa los fallos que se colaron
 * durante el rediseño: tokens de color rotos, keyframes que no llegan al CSS y
 * un fondo a pantalla completa capturando toques.
 */
export default defineConfig({
  testDir: "./tests/visual",
  // UN reintento. No enmascara regresiones: una diferencia real es determinista
  // y falla las dos veces. Lo que absorbe es el tropiezo de estabilización —
  // Playwright exige dos capturas consecutivas idénticas y de vez en cuando no
  // lo consigue dentro del plazo, sin que nada del diseño haya cambiado.
  retries: 1,
  fullyParallel: true,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  // Si algún día se retoman las capturas: separar por {projectName} es
  // OBLIGATORIO (claro y oscuro escriben el mismo archivo y se pisan la
  // referencia), y por {platform} también (Windows y Linux nunca coinciden).
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{platform}/{arg}{ext}",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    // La app es móvil primero: se prueba como la usan en el piso de venta.
    ...devices["Pixel 7"],
    screenshot: "only-on-failure"
  },

  projects: [
    { name: "movil-claro", use: { ...devices["Pixel 7"], colorScheme: "light" } },
    // El modo oscuro va aparte a propósito: ahí vivió la colisión de tokens que
    // habría dejado la app sin colores sin que ningún test se enterara.
    { name: "movil-oscuro", use: { ...devices["Pixel 7"], colorScheme: "dark" } }
  ],

  webServer: {
    command: "pnpm start -p 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Valores mínimos para que arranque sin base de datos real. Ninguna de
      // las rutas bajo prueba consulta Postgres.
      AUTH_SECRET: process.env.AUTH_SECRET ?? "playwright-secret-de-32-caracteres-min",
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://user:pass@127.0.0.1:5432/none",
      WEBAUTHN_RP_ID: "localhost",
      WEBAUTHN_RP_NAME: "Clarvex Team",
      WEBAUTHN_ORIGIN: "http://127.0.0.1:3100"
    }
  }
});
