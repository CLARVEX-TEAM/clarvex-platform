"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { noteViewRedirect, prefersDesktop } from "@/lib/view-mode";

/**
 * Si gerencia abre la app móvil en una pantalla grande (computadora), la lleva a
 * la versión de escritorio. En móvil no hace nada. No afecta a los asesores.
 * Se monta en la home de gerente (/manager).
 */
export function DesktopAutoRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!prefersDesktop()) return;
    getSession().then((session) => {
      if (session && session.role !== "ASESOR") { noteViewRedirect(); router.replace("/escritorio"); }
    });
  }, [router]);
  return null;
}
