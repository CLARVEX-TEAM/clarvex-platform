"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor } from "lucide-react";
import { getViewPreference, prefersDesktop, setViewPreference } from "@/lib/view-mode";

/**
 * Atajo (solo gerencia, solo en móvil) para forzar la versión de escritorio en
 * este equipo: útil en POS de tienda donde la detección automática por ancho no
 * alcanza. Queda recordado en el dispositivo.
 */
export function DesktopSwitchLink() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Ya está en escritorio por detección o preferencia → no hace falta el atajo.
    setVisible(!prefersDesktop() && getViewPreference() !== "desktop");
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => { setViewPreference("desktop"); router.replace("/escritorio"); }}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-panel py-3 text-sm font-semibold text-volt transition active:scale-[0.98]"
    >
      <Monitor size={16} /> Usar versión de escritorio (computadora)
    </button>
  );
}
