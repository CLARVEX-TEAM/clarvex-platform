// Logger de diagnóstico para la sincronización de fuentes de datos.
// En producción queda apagado por defecto para no ensuciar los logs de PM2;
// se activa con DEBUG_SYNC=1 (pm2 restart clarvex-team --update-env).
const enabled = process.env.DEBUG_SYNC === "1" || process.env.NODE_ENV !== "production";

export function syncLog(...args: unknown[]) {
  if (enabled) console.log(...args);
}
