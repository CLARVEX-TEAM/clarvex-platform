/**
 * Reglas de los escaneos del cierre: qué papel juega cada tarea y cómo se nombra
 * su PDF. Se decide por el TEXTO del punto (no por su key), para que aguante que
 * gerencia renombre o reordene los puntos del checklist.
 *
 *  - "vouchers"  → la tarea de vouchers de terminal. Su PDF: "VOUCHERS <tienda> <fecha>".
 *                  Sus páginas se copian también a la tarea de cierre.
 *  - "cierre"    → la tarea del corte de caja. Su PDF: "CIERRE DE TIENDA <fecha>",
 *                  que junta el corte + los vouchers copiados.
 *  - "other"     → cualquier otro escaneo (depósito, etc.).
 */

export type ScanRole = "vouchers" | "cierre" | "other";

export function scanRole(label: string): ScanRole {
  const l = label.toLowerCase();
  if (l.includes("voucher")) return "vouchers";
  if (l.includes("corte") || l.includes("cierre")) return "cierre";
  return "other";
}

/** "2026-07-18" → "18-07-2026" (fecha del día para el nombre del archivo). */
export function formatScanDate(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : dateKey;
}

/** Nombre "bonito" del documento para el pie de foto de Telegram. */
export function scanDocumentLabel(label: string): string {
  switch (scanRole(label)) {
    case "vouchers": return "Vouchers";
    case "cierre": return "Cierre de tienda";
    default: return label.replace(/^Escanear\s+/i, "");
  }
}

/** Nombre del archivo PDF que se descarga / llega a Telegram. */
export function scanPdfFileName(label: string, storeName: string, dateKey: string): string {
  const date = formatScanDate(dateKey);
  switch (scanRole(label)) {
    case "vouchers": return `VOUCHERS ${storeName} ${date}.pdf`;
    case "cierre": return `CIERRE DE TIENDA ${date}.pdf`;
    default: return `${label.replace(/^Escanear\s+/i, "")} ${date}.pdf`;
  }
}
