// Checklist de apertura/cierre de tienda — lista FIJA predefinida.
// Solo gerencia la completa; evidencia (foto) opcional por item.

export type ChecklistSection = "APERTURA" | "CIERRE";
export type ChecklistItemDef = { section: ChecklistSection; key: string; label: string };

export const CHECKLIST_ITEMS: ChecklistItemDef[] = [
  { section: "APERTURA", key: "ap-luces", label: "Encender luces, música y pantallas" },
  { section: "APERTURA", key: "ap-limpieza", label: "Verificar limpieza del piso de venta" },
  { section: "APERTURA", key: "ap-escaparate", label: "Revisar escaparate y orden visual" },
  { section: "APERTURA", key: "ap-caja", label: "Abrir caja con el fondo correcto" },
  { section: "APERTURA", key: "ap-personal", label: "Confirmar asistencia y uniforme del personal" },
  { section: "CIERRE", key: "ci-caja", label: "Cuadrar y cerrar caja" },
  { section: "CIERRE", key: "ci-deposito", label: "Preparar el depósito del día" },
  { section: "CIERRE", key: "ci-limpieza", label: "Limpieza general y reposición" },
  { section: "CIERRE", key: "ci-equipos", label: "Apagar luces, equipos y pantallas" },
  { section: "CIERRE", key: "ci-alarma", label: "Activar alarma y cerrar la tienda" }
];

export const CHECKLIST_SECTIONS: ChecklistSection[] = ["APERTURA", "CIERRE"];

export function findChecklistItem(key: string): ChecklistItemDef | undefined {
  return CHECKLIST_ITEMS.find((item) => item.key === key);
}
