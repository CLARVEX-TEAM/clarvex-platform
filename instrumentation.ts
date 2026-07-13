import * as Sentry from "@sentry/nextjs";

// Hook de instrumentación de Next.js. Carga la config de Sentry según el runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captura los errores no manejados de route handlers y server components.
export const onRequestError = Sentry.captureRequestError;
