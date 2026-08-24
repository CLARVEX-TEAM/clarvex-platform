"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { clearLoginBounces, noteLoginBounce } from "@/lib/session-loop";
import type { User } from "@/lib/types";

/**
 * La sesión del cliente, con recuperación automática.
 *
 * Por qué existe: casi todas las pantallas hacían
 * `getSession().then(setSession)` sin `.catch`, y más abajo cortaban con
 * `if (!session) return;` antes de pedir sus datos. Cuando el fetch de sesión
 * ni siquiera lograba salir —señal intermitente, o el navegador abortándolo al
 * reanudar la PWA desde segundo plano— `session` se quedaba en null y la
 * pantalla no volvía a intentarlo nunca: esqueleto para siempre.
 *
 * ⚠️ Poner un `.catch` vacío en cada sitio NO arreglaba nada. El cuelgue no lo
 * causa el rechazo sin atender, sino que `session` nunca se asigna; un catch
 * vacío solo silencia el error y deja la pantalla igual de pegada, pero
 * pareciendo corregida.
 *
 * Lo que sí lo arregla es reintentar cuando cambia lo que hizo fallar: al
 * volver a la app y al recuperar internet. Así la pantalla se destraba sola,
 * sin que cada una tenga que dibujar su propia pantalla de error. Es el mismo
 * patrón que `useAppData` ya usa para los datos.
 *
 * `failed` queda expuesto para las pantallas que además quieran ofrecer un
 * botón de reintentar; ninguna está obligada a usarlo.
 */
export function useSession(options?: { redirectOnMissing?: boolean }) {
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [failed, setFailed] = useState(false);
  const redirectOnMissing = options?.redirectOnMissing ?? false;

  const reload = useCallback(() => {
    setFailed(false);
    return getSession()
      .then((current) => {
        // `null` aquí SÍ es una respuesta: el servidor dijo que no hay sesión.
        // `getSession` lanza cuando no pudo ni preguntar, y eso cae al catch.
        if (!current && redirectOnMissing) {
          noteLoginBounce("use-session");
          router.replace("/login");
        } else {
          if (current) clearLoginBounces();
          setSession(current);
        }
      })
      .catch(() => setFailed(true));
  }, [router, redirectOnMissing]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Reintento cuando cambia la circunstancia que pudo haberlo tumbado. Sin
  // temporizador: si no hay sesión resuelta, insistir cada X segundos gastaría
  // batería sin más señal de que algo cambió.
  useEffect(() => {
    if (session) return;
    const retry = () => { void reload(); };
    const onVisible = () => { if (document.visibilityState === "visible") retry(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("clarvex-online", retry);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("clarvex-online", retry);
    };
  }, [session, reload]);

  return { session, failed, reload } as const;
}
