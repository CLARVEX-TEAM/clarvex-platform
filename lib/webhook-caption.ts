/**
 * Texto del mensaje que llega al canal de Telegram.
 *
 * Se arma AQUÍ, no en n8n. Dos razones:
 *  - El formato queda en código, con tests. Cambiarlo no es arrastrar cajitas.
 *  - El flujo de n8n se reduce a: recibe → manda la foto con este texto. Tonto y
 *    difícil de romper.
 *
 * El requisito es que el mensaje se entienda SOLO: quién subió qué, de qué es, y
 * cuándo. Una foto suelta en un canal no sirve de nada.
 */

/** Telegram corta los pies de foto en 1024 caracteres. */
const MAX_CAPTION = 1000;

export type EvidenceCaptionInput = {
  storeName: string;
  uploaderName: string;
  employeeNumber: string;
  /** pending | task | logEntry | announcement */
  resourceKind: string;
  resourceTitle: string;
  note: string | null;
  createdAt: Date;
};

export type InventoryCaptionInput = {
  storeName: string;
  reporterName: string;
  employeeNumber: string;
  productName: string;
  category: string;
  note: string | null;
  createdAt: Date;
};

const KIND_LABEL: Record<string, string> = {
  pending: "Pendiente",
  task: "Plan del día",
  logEntry: "Bitácora",
  announcement: "Comunicado"
};

/** "14 jul, 9:30 a.m." en hora de Monterrey (no la del servidor, que es UTC). */
function when(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Monterrey",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function trim(caption: string): string {
  return caption.length <= MAX_CAPTION ? caption : `${caption.slice(0, MAX_CAPTION - 1)}…`;
}

export function evidenceCaption(input: EvidenceCaptionInput): string {
  const kind = KIND_LABEL[input.resourceKind] ?? "Evidencia";
  const lines = [
    `📎 Evidencia · ${input.storeName}`,
    `👤 ${input.uploaderName} (${input.employeeNumber})`,
    `📌 ${kind}: ${input.resourceTitle}`
  ];
  if (input.note) lines.push(`📝 ${input.note}`);
  lines.push(`🕐 ${when(input.createdAt)}`);
  return trim(lines.join("\n"));
}

export function inventoryCaption(input: InventoryCaptionInput): string {
  const lines = [
    `📦 Faltante · ${input.storeName}`,
    `👤 ${input.reporterName} (${input.employeeNumber})`,
    `🏷️ ${input.productName}`,
    `📂 ${input.category}`
  ];
  if (input.note) lines.push(`📝 ${input.note}`);
  lines.push(`🕐 ${when(input.createdAt)}`);
  return trim(lines.join("\n"));
}
