"use client";

import { StoreMap3D } from "@/components/StoreMap3D";

/**
 * Mapa de tienda: vista 3D para todos. La gerencia (canEdit) puede agregar,
 * editar, mover, girar y borrar muebles directamente sobre el mapa.
 */
export function StoreMapTabs({ canEdit }: { canEdit: boolean }) {
  return <StoreMap3D canEdit={canEdit} />;
}
