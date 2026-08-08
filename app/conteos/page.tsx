"use client";

import { AppFrame, AppHeader } from "@/components/ui";
import { ConteosListView } from "@/components/conteos/ConteosList";

export default function ConteosPage() {
  return (
    <>
      <AppHeader title="Conteos" subtitle="Inventario físico por marbete" backHref="/manager" />
      <AppFrame>
        <ConteosListView />
      </AppFrame>
    </>
  );
}
