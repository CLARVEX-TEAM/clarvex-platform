"use client";

import { StoreMapTabs } from "@/components/StoreMapTabs";

// El escritorio es solo gerencia, así que siempre puede administrar el mapa.
export default function EscritorioMapa() {
  return <StoreMapTabs canEdit />;
}
