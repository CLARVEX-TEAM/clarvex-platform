// Checklist de apertura/cierre de tienda — lista FIJA predefinida.
// Solo gerencia la completa; evidencia (foto) opcional por item.
//
// Dos tipos de ítem:
//  - "check": una tarea que se marca hecha (con foto y nota opcionales).
//  - "scan":  un documento que se ESCANEA — admite VARIAS fotos y cada una se
//             manda al canal de Telegram para descargarla y subirla a Checklist
//             Fácil. Se usa para el corte de caja, los vouchers y el depósito.

export type ChecklistSection = "APERTURA" | "CIERRE";
export type ChecklistItemKind = "check" | "scan";
export type ChecklistItemDef = { section: ChecklistSection; key: string; label: string; kind: ChecklistItemKind };

export const CHECKLIST_ITEMS: ChecklistItemDef[] = [
  { section: "APERTURA", key: "ap-luces", label: "Encender luces, música y pantallas", kind: "check" },
  { section: "APERTURA", key: "ap-limpieza", label: "Verificar limpieza del piso de venta", kind: "check" },
  { section: "APERTURA", key: "ap-escaparate", label: "Revisar escaparate y orden visual", kind: "check" },
  { section: "APERTURA", key: "ap-caja", label: "Abrir caja con el fondo correcto", kind: "check" },
  { section: "APERTURA", key: "ap-personal", label: "Confirmar asistencia y uniforme del personal", kind: "check" },
  { section: "CIERRE", key: "ci-caja", label: "Cuadrar y cerrar caja", kind: "check" },
  // Escaneos del cierre: van al canal de Telegram (varias fotos por documento).
  { section: "CIERRE", key: "ci-scan-corte", label: "Escanear corte de caja", kind: "scan" },
  { section: "CIERRE", key: "ci-scan-vouchers", label: "Escanear vouchers de terminal", kind: "scan" },
  { section: "CIERRE", key: "ci-scan-deposito", label: "Escanear comprobante de depósito", kind: "scan" },
  { section: "CIERRE", key: "ci-deposito", label: "Preparar el depósito del día", kind: "check" },
  { section: "CIERRE", key: "ci-limpieza", label: "Limpieza general y reposición", kind: "check" },
  { section: "CIERRE", key: "ci-equipos", label: "Apagar luces, equipos y pantallas", kind: "check" },
  { section: "CIERRE", key: "ci-alarma", label: "Activar alarma y cerrar la tienda", kind: "check" }
];

export const CHECKLIST_SECTIONS: ChecklistSection[] = ["APERTURA", "CIERRE"];

export function findChecklistItem(key: string): ChecklistItemDef | undefined {
  return CHECKLIST_ITEMS.find((item) => item.key === key);
}

/** ¿Es un ítem de escaneo (varias fotos que van a Telegram)? */
export function isScanItem(key: string): boolean {
  return findChecklistItem(key)?.kind === "scan";
}
