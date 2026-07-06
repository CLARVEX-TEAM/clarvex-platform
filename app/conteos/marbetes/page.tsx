"use client";

import { AppFrame, AppHeader, BottomNav } from "@/components/ui";
import { ConteosMarbetesView } from "@/components/conteos/ConteosMarbetes";

export default function MarbetesPage() {
  return (
    <>
      <AppHeader title="Marbetes" subtitle="Catálogo fijo de tienda y bodega" backHref="/conteos" />
      <AppFrame>
        <ConteosMarbetesView />
      </AppFrame>
      <BottomNav />
    </>
  );
}
