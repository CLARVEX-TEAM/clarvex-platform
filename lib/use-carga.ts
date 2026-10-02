"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Una carga que se destraba sola cuando vuelve la señal.
 *
 * ⚠️ **Por qué existe.** Cuatro pantallas de Conteos pedían sus datos con un
 * `fetch` sin `catch`. Cuando la petición ni siquiera lograba salir --la señal
 * del centro comercial se cae a diario-- el estado se quedaba en `null`, el
 * render entraba por la rama de «Cargando…» y **ahí se quedaba para siempre**:
 * sin mensaje, sin botón y sin nada que volviera a intentarlo. Desde fuera no
 * se distingue de una carga lenta, así que la persona espera.
 *
 * ⚠️ **Y un `catch` vacío NO lo arregla.** El cuelgue no lo causa el rechazo sin
 * atender, sino que el dato nunca se asigna: un catch vacío solo silencia el
 * error y deja la pantalla igual de pegada, pero pareciendo corregida. Está
 * escrito igual en `lib/use-session.ts`, que es donde este proyecto aprendió la
 * lección con `getSession()`.
 *
 * Lo que sí la arregla es reintentar **cuando cambia lo que la tumbó**: al
 * volver a la app y al recuperar internet. Ese es el mismo par de señales que
 * usan `useSession` y `useAppData`.
 *
 * ⚠️ **Por evento y NUNCA por temporizador.** Insistir cada X segundos gasta
 * batería sin ninguna señal de que algo haya cambiado, y estas pantallas viven
 * en el teléfono de la tienda toda la jornada.
 *
 * ⚠️ **Y solo escucha mientras ha fallado.** Pasada la carga, deja de oír: si
 * no, cada vez que alguien saca el teléfono del bolsillo se dispararía una
 * petición más, que no es lo que este arreglo viene a hacer.
 *
 * @param cargar  lo que pide los datos. Si lanza, se marca el fallo.
 * @param activo  `false` lo mantiene en espera -- p. ej. hasta tener sesión.
 */
export function useCargaConReintento(cargar: () => Promise<unknown>, activo = true) {
  const [fallo, setFallo] = useState(false);
  const [cargando, setCargando] = useState(false);

  const intentar = useCallback(async () => {
    setCargando(true);
    try {
      await cargar();
      setFallo(false);
    } catch {
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, [cargar]);

  useEffect(() => {
    if (!activo) return;
    void intentar();
  }, [activo, intentar]);

  useEffect(() => {
    if (!activo || !fallo) return;
    const reintentar = () => { void intentar(); };
    const alVolver = () => { if (document.visibilityState === "visible") reintentar(); };
    document.addEventListener("visibilitychange", alVolver);
    /*
     * `clarvex-online` y no el `online` del navegador: en Android ese evento
     * puede no llegar NUNCA. Lo documenta `lib/conexion.ts`, que lo descubrió
     * con la franja de «sin conexión» que se quedaba puesta teniendo red.
     */
    window.addEventListener("clarvex-online", reintentar);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("clarvex-online", reintentar);
    };
  }, [activo, fallo, intentar]);

  return { fallo, cargando, reintentar: intentar } as const;
}
