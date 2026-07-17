// Puntos del checklist. La lista de aquí es solo la SEMILLA por defecto: al abrir
// el checklist por primera vez de una tienda, se copian a la BD (tabla
// ChecklistItem) y a partir de ahí gerencia los edita. Los "scan" van a Telegram
// como PDF (corte de caja, vouchers, depósito).

export type ChecklistSection = "APERTURA" | "CIERRE";
export type ChecklistItemKind = "check" | "scan";
export type ChecklistItemDef = { section: ChecklistSection; key: string; label: string; kind: ChecklistItemKind };

export const DEFAULT_CHECKLIST_ITEMS: ChecklistItemDef[] = [
  { section: "APERTURA", key: "ap-luces", label: "Encender luces, música y pantallas", kind: "check" },
  { section: "APERTURA", key: "ap-limpieza", label: "Verificar limpieza del piso de venta", kind: "check" },
  { section: "APERTURA", key: "ap-escaparate", label: "Revisar escaparate y orden visual", kind: "check" },
  { section: "APERTURA", key: "ap-caja", label: "Abrir caja con el fondo correcto", kind: "check" },
  { section: "APERTURA", key: "ap-personal", label: "Confirmar asistencia y uniforme del personal", kind: "check" },
  { section: "CIERRE", key: "ci-caja", label: "Cuadrar y cerrar caja", kind: "check" },
  { section: "CIERRE", key: "ci-scan-corte", label: "Escanear corte de caja", kind: "scan" },
  { section: "CIERRE", key: "ci-scan-vouchers", label: "Escanear vouchers de terminal", kind: "scan" },
  { section: "CIERRE", key: "ci-scan-deposito", label: "Escanear comprobante de depósito", kind: "scan" },
  { section: "CIERRE", key: "ci-deposito", label: "Preparar el depósito del día", kind: "check" },
  { section: "CIERRE", key: "ci-limpieza", label: "Limpieza general y reposición", kind: "check" },
  { section: "CIERRE", key: "ci-equipos", label: "Apagar luces, equipos y pantallas", kind: "check" },
  { section: "CIERRE", key: "ci-alarma", label: "Activar alarma y cerrar la tienda", kind: "check" }
];

export const CHECKLIST_SECTIONS: ChecklistSection[] = ["APERTURA", "CIERRE"];

export function isChecklistSection(value: string): value is ChecklistSection {
  return value === "APERTURA" || value === "CIERRE";
}

export function isChecklistKind(value: string): value is ChecklistItemKind {
  return value === "check" || value === "scan";
}
