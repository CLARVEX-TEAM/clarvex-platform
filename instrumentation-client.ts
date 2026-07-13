import * as Sentry from "@sentry/nextjs";

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
    sendDefaultPii: false
  });
}

// Instrumenta las navegaciones del App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
