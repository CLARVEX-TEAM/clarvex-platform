"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { rutaMedible, seApunta } from "@/lib/metrica-pantallas";

/**
 * Apunta qué pantalla se abre, para poder responder en un mes qué se usa.
 *
 * ⚠️ **Tiene que ser de CLIENTE.** Dentro de la app las navegaciones no llegan
 * al servidor: el App Router cambia de pantalla sin pedir el documento otra vez,
 * así que el registro del proxy solo vería el primer arranque. Medir desde el
 * servidor daría «todo el mundo abre Mi día y nada más», que es falso.
 *
 * ⚠️ **Va en el layout raíz, y eso tiene una trampa conocida**: un componente
 * de ahí se monta UNA sola vez por documento y no se vuelve a montar en una
 * navegación de cliente --ya costó tres fallos en este proyecto--. Aquí no
 * estorba porque lo que dispara el efecto es `pathname`, que `usePathname()` sí
 * actualiza sin remontar nada. Por eso la dependencia es `[pathname]` y no `[]`.
 *
 * ⚠️ **Y no puede estorbar a nadie.** Se manda y se olvida: sin reintentos, sin
 * avisos y **nunca por la cola sin conexión**. La cola es FIFO y una visita
 * atascada delante dejaría una evidencia de verdad esperando detrás. Perder
 * estadística es barato; perder una captura no.
 */
export function MedidorDePantallas() {
  const pathname = usePathname() ?? "";
  const ultima = useRef<{ ruta: string; cuando: number } | null>(null);

  useEffect(() => {
    const ruta = rutaMedible(pathname);
    if (!ruta) return;

    const ahora = Date.now();
    if (!seApunta(ruta, ultima.current, ahora)) return;
    ultima.current = { ruta, cuando: ahora };

    // `keepalive` para que salga aunque la pantalla se cierre justo después.
    void fetch("/api/metrica/vista", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruta }),
      keepalive: true
    }).catch(() => {
      // Sin señal, sin sesión todavía o el servidor caído: da igual. Esto no
      // se reintenta a propósito --ver el comentario de arriba--.
    });
  }, [pathname]);

  return null;
}
