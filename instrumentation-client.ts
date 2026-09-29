import * as Sentry from "@sentry/nextjs";
import { humanizeError } from "@/lib/sentry-humanize";
import { iniciarFaro } from "@/lib/faro";

/*
 * ⚠️ Faro y Sentry CONVIVEN a proposito, y es temporal.
 *
 * Lo nuevo se verifica recibiendo antes de retirar lo viejo. Sentry sale cuando
 * se compruebe que un error real llega a Grafana y llega LEGIBLE --con sus
 * source maps--, no antes: quitarlo primero deja la app sin nadie mirando los
 * errores del navegador, que es la mitad de los que reporta esta tienda.
 *
 * No se pisan: cada uno engancha sus propios manejadores y ninguno sustituye
 * los del otro.
 */
iniciarFaro(process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0");

// Errores del navegador (PWA en móvil y escritorio).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // Session Replay apagado: grabaría pantallas con datos de ventas y empleados.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    /*
     * Titula en claro lo que llega del navegador.
     *
     * `AbortError: signal is aborted without reason` no le dice nada a quien
     * abre la alerta, y desde un celular en tienda la mayoría de lo que llega
     * son cortes de señal. Sin traducir, la bandeja se vuelve ilegible y los
     * fallos de verdad se pierden entre el ruido.
     *
     * Se retitula y se baja de nivel, NUNCA se descarta: ver el porqué en
     * lib/sentry-humanize.
     */
    beforeSend(event) {
      const exception = event.exception?.values?.[0];
      const humanized = humanizeError(exception?.value ?? event.message);
      if (!humanized) return event;

      event.level = humanized.level;
      if (exception) {
        // El tipo original se conserva a un lado: sin él se pierde la pista
        // técnica que a veces es justo lo que resuelve el caso.
        event.tags = { ...event.tags, error_original: exception.type ?? "desconocido" };
        exception.value = `${humanized.title} (${exception.value ?? ""})`.trim();
      } else {
        event.message = humanized.title;
      }
      return event;
    }
  });
}

// Instrumenta las navegaciones del App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
