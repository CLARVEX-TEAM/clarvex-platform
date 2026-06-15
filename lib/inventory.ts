export const INVENTORY_CATEGORIES = ["AGOTADO", "DANADO", "FALTANTE", "ETIQUETA", "OTRO"] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export const INVENTORY_CATEGORY_LABELS: Record<string, string> = {
  AGOTADO: "Agotado",
  DANADO: "Dañado",
  FALTANTE: "Faltante en piso",
  ETIQUETA: "Etiqueta / precio",
  OTRO: "Otro"
};

export function isInventoryCategory(value: string): value is InventoryCategory {
  return (INVENTORY_CATEGORIES as readonly string[]).includes(value);
}
