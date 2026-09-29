"use client";

import { useCallback, useSyncExternalStore } from "react";
import { enContenedorNativo } from "@/lib/puente-nativo";

/**
 * Elige la clase de color según la superficie: la del rediseño «papel» dentro
 * de la APK, y la de antes del rediseño en navegador, PWA, iPhone y escritorio.
 *
 * ⚠️ El rediseño del 28 de septiembre de 2026 (`bdec39c`) cambió los tonos de
 * Conteos --`text-emerald-600` pasó a `text-mint`, etc.-- en TODAS las
 * superficies, porque `mint`, `orchid` y `ember` son tokens fijos, no de
 * `[data-surface="papel"]`. El rediseño es solo de la APK, así que fuera de ella
 * se conserva la clase vieja.
 *
 * `useSyncExternalStore` con `false` en el servidor: la hidratación pinta la
 * versión web y React la corrige al instante sin error de hidratación. El
 * agente no cambia durante la vida del documento, así que no hay a qué
 * suscribirse.
 */
const sinSuscripcion = () => () => {};

export function useTono() {
  const enApk = useSyncExternalStore(sinSuscripcion, enContenedorNativo, () => false);
  return useCallback((papel: string, web: string) => (enApk ? papel : web), [enApk]);
}
