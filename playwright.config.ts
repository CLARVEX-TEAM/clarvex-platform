import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de regresión visual.
 *
 * Por qué existen: durante el rediseño, TODOS los fallos visuales se
 * descubrieron mandando capturas del móvil por chat — un efecto que no se veía,
 * otro aplicado en la pantalla equivocada. El build, el lint y los 403 tests
 * pasaban en verde mientras tanto. Nada de eso mira píxeles.
 *
 * ALCANCE ACTUAL: solo pantallas que renderizan SIN base de datos. El CI no
 * levanta Postgres, y las pantallas con sesión necesitan datos. Para ampliarlo
 * a /advisor o /manager hace falta añadir un servicio de Postgres al workflow y
 * entrar por el modo demo (`/api/demo/manager`), que no pide PIN.
 *
 * ⚠️ Las capturas de referencia son POR SISTEMA OPERATIVO: las generadas en
 * Windows no coinciden con las de Linux (fuentes y antialiasing distintos). Por
 * eso el nombre del archivo incluye la plataforma, y el CI necesita las suyas
 * propias generadas en Linux.
 */
export default defineConfig({
  testDir: "./tests/visual",
  // Cada prueba compara contra su referencia; sin reintentos para no enmascarar
  // una diferencia real como si fuera intermitencia.
  retries: 0,
  fullyParallel: true,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  // `{projectName}` es OBLIGATORIO: sin él, los proyectos claro y oscuro
  // escriben en el mismo archivo y se pisan la referencia mutuamente (falla uno
  // de cada dos, con ~85% de píxeles distintos: un tema contra el otro).
  // `{platform}` permite que convivan las referencias de Windows y de Linux,
  // que nunca coinciden por el renderizado de fuentes.
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{platform}/{arg}{ext}",

  expect: {
    toHaveScreenshot: {
      // Calibrado, no elegido a ojo. Con 0.01 (1%) un cambio de color de texto
      // NO se detectaba: las letras de un título ocupan menos del 1% de los
      // píxeles de la tarjeta y la regresión pasaba por debajo del umbral.
      // 0.002 sí la caza y aguanta dos corridas limpias seguidas sin ruido.
      maxDiffPixelRatio: 0.002,
      animations: "disabled"
    }
  },

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
