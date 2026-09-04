"use client";

import { useEffect, useState } from "react";
import { logout } from "@/lib/auth";

/**
 * Aviso flotante "Modo demostración". Aparece solo cuando la sesión es demo
 * (usuario isDemo). Flota arriba-centro para no empujar el layout. Incluye un
 * botón "Salir" que cierra la sesión demo y regresa al sitio de la marca.
 */
export function DemoBanner() {
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.user?.demo) setDemo(true); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (!demo) return null;

  async function exit() {
    await logout().catch(() => undefined);
    /*
     * ⚠️ **A la página del producto, NO a `clarvex.tech`.**
     *
     * Ese es el sitio de la agencia y su llamada principal es «Cotizar
     * proyecto». Quien acababa de ver el producto aterrizaba en una oferta de
     * desarrollo a medida, que es exactamente la contradicción por la que
     * Cloudflare rechazó la solicitud en septiembre de 2026.
     */
    window.location.href = "/producto";
  }

  return (
    <div className="fixed left-1/2 z-[200] flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-400/50 bg-amber-400/95 px-3 py-1.5 text-[12px] font-semibold text-black shadow-lg backdrop-blur bottom-[calc(76px+env(safe-area-inset-bottom))]">
      <span>🎬 Modo demo</span>
      <button
        type="button"
        onClick={() => void exit()}
        className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] font-bold transition active:scale-95"
      >
        Salir
      </button>
    </div>
  );
}
