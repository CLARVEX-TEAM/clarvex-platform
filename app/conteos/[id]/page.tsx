"use client";

import { useParams } from "next/navigation";
import { AppFrame, AppHeader, BottomNav } from "@/components/ui";
import { ConteoDetailView } from "@/components/conteos/ConteoDetail";

export default function ConteoDetallePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <AppHeader title="Conteo" subtitle="Captura por marbete" backHref="/conteos" />
      <AppFrame>
        <ConteoDetailView countId={id} />
      </AppFrame>
      <BottomNav />
    </>
  );
}
