"use client";

import { AppFrame, AppHeader, BottomNav } from "@/components/ui";
import { PartidoAdminView } from "@/components/PartidoAdmin";

export default function PartidoPage() {
  return (
    <>
      <AppHeader title="Partidos del Mundial" subtitle="Programa partidos y transmisiones" backHref="/manager" />
      <AppFrame>
        <PartidoAdminView />
      </AppFrame>
      <BottomNav />
    </>
  );
}
