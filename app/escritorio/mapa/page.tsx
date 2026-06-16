"use client";

import { StoreMap } from "@/components/StoreMap";

// El escritorio es solo gerencia, así que siempre puede editar el mapa.
export default function EscritorioMapa() {
  return <StoreMap canEdit />;
}
