import * as Sentry from "@sentry/nextjs";

// Errores del servidor (route handlers, server components, cron).
// Sin DSN configurado, Sentry no se inicializa: no-op total.
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Muestreo de trazas de rendimiento. 10% es suficiente para una app interna
    // y mantiene el uso dentro del free tier.
    tracesSampleRate: 0.1,
    // No enviar IP ni cookies: la app maneja datos de empleados.
    sendDefaultPii: false
  });
}
