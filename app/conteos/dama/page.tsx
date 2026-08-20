"use client";

import { AppFrame, AppHeader } from "@/components/ui";
import { ConteoDiarioView } from "@/components/conteos/ConteoDiario";

export default function ConteoDamaPage() {
  return (
    <>
      <AppHeader title="Conteo diario" subtitle="Piso de venta · Dama" backHref="/conteos" />
      <AppFrame>
        <ConteoDiarioView section="DAMA" />
      </AppFrame>
    </>
  );
}
