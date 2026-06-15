export const TRAINING_CATEGORIES = ["VENTAS", "PRODUCTO", "ATENCION", "POLITICAS", "OTRO"] as const;
export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number];

export const TRAINING_CATEGORY_LABELS: Record<string, string> = {
  VENTAS: "Ventas",
  PRODUCTO: "Producto",
  ATENCION: "Atención al cliente",
  POLITICAS: "Políticas",
  OTRO: "Otro"
};

export function isTrainingCategory(value: string): value is TrainingCategory {
  return (TRAINING_CATEGORIES as readonly string[]).includes(value);
}
