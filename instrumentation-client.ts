import { iniciarFaro } from "@/lib/faro";

/**
 * Errores del navegador (PWA en móvil y escritorio).
 *
 * Sustituye a Sentry, retirado el 29 de septiembre de 2026. Lo que hacía se
 * reparte en dos: las trazas y los errores del servidor van por OpenTelemetry
 * al colector de la máquina, y esto se queda con lo del navegador.
 *
 * ⚠️ Lo que NO cambia, porque son decisiones tomadas con motivo:
 *
 *   - No se graba la pantalla. Sentry tenía Session Replay apagado a propósito
 *     --grabaría ventas y datos de empleados-- y Faro va sin `captureConsole`
 *     por lo mismo: la app escribe respuestas de KPIs y nombres ahí.
 *   - Los cortes de red se RETITULAN y bajan de nivel, nunca se descartan. Un
 *     `AbortError` fue justo lo que delató tres componentes globales sin
 *     `.catch`. Ver `lib/sentry-humanize`, que conserva el nombre para no
 *     romper su prueba.
 */
iniciarFaro(process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0");
