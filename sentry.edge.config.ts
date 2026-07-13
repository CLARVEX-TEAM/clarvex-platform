import * as Sentry from "@sentry/nextjs";

// Errores del runtime edge (middleware: el gate de auth de /api y las rutas).
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false
  });
}
