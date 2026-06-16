"use client";

import { useEffect, useState } from "react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, BottomNav } from "@/components/ui";
import { StoreMap } from "@/components/StoreMap";

export default function MapaPage() {
  const [session, setSession] = useState<User | null>(null);
  useEffect(() => { getSession().then(setSession); }, []);
  const isManager = Boolean(session && session.role !== "ASESOR");

  return (
    <>
      <AppHeader title="Mapa de tienda" subtitle="Consulta qué estilos hay en cada rack o mueble." backHref={session?.role === "ASESOR" ? "/advisor" : "/manager"} />
      <AppFrame>
        <StoreMap canEdit={isManager} />
      </AppFrame>
      <BottomNav />
    </>
  );
}
