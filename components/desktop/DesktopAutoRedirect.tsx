"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DESKTOP_MIN_WIDTH } from "@/components/desktop/DesktopShell";

/**
 * Si gerencia abre la app móvil en una pantalla grande (computadora), la lleva a
 * la versión de escritorio. En móvil no hace nada. No afecta a los asesores.
 * Se monta en la home de gerente (/manager).
 */
export function DesktopAutoRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth < DESKTOP_MIN_WIDTH) return;
    getSession().then((session) => {
      if (session && session.role !== "ASESOR") router.replace("/escritorio");
    });
  }, [router]);
  return null;
}
