// Conteos cíclicos por marbete — lógica del formato "Mesa de Control":
//   Diferencia = 2do conteo − 1er conteo
//   Real       = si no hay 2do conteo o la diferencia es 0 → 1er conteo;
//                con diferencia → 3er conteo (o el 2do si aún no hay 3ro).

export type CycleZone = "PISO" | "BODEGA";

export type SerializedTag = {
  id: string;
  number: number;
  zone: CycleZone;
  label: string | null;
  active: boolean;
};

export type SerializedEntry = {
  tagId: string;
  count1: number | null;
  count1ByName: string | null;
  count1At: string | null;
  count2: number | null;
  count2ByName: string | null;
  count3: number | null;
  count3ByName: string | null;
  // Avance derivado que el servidor manda SIEMPRE. En el "conteo ciego" (asesor)
  // los valores count1/2/3 vienen en null y estos campos permiten mostrar el
  // progreso (qué conteo va, si necesita recuento, si quedó resuelto) sin revelar
  // las piezas que capturó otra persona.
  slotsFilled?: readonly [boolean, boolean, boolean];
  needsRecount?: boolean;
  resolved?: boolean;
};

export type EntryLike = {
  count1: number | null;
  count2: number | null;
  count3: number | null;
  slotsFilled?: readonly [boolean, boolean, boolean];
  needsRecount?: boolean;
  resolved?: boolean;
};

/** Piezas reales del marbete según la regla del formato. */
export function entryReal(entry: EntryLike): number | null {
  if (entry.count1 === null) return null;
  if (entry.count2 === null || entry.count2 === entry.count1) return entry.count1;
  return entry.count3 ?? entry.count2;
}

/** Diferencia 2do − 1er (null si falta alguno). */
export function entryDifference(entry: EntryLike): number | null {
  if (entry.count1 === null || entry.count2 === null) return null;
  return entry.count2 - entry.count1;
}

/** Marbete con discrepancia pendiente: 2do ≠ 1er y sin 3er conteo. */
export function entryNeedsRecount(entry: EntryLike): boolean {
  if (typeof entry.needsRecount === "boolean") return entry.needsRecount; // conteo ciego
  return entry.count1 !== null && entry.count2 !== null && entry.count2 !== entry.count1 && entry.count3 === null;
}

/** Cuántos conteos se han registrado en el marbete (0 a 3). */
export function entryCountsDone(entry: EntryLike): number {
  if (entry.slotsFilled) return entry.slotsFilled.filter(Boolean).length; // conteo ciego
  return (entry.count1 !== null ? 1 : 0) + (entry.count2 !== null ? 1 : 0) + (entry.count3 !== null ? 1 : 0);
}

/** ¿El marbete quedó resuelto (hay piezas reales)? Sin revelar el número. */
export function entryResolved(entry: EntryLike): boolean {
  if (typeof entry.resolved === "boolean") return entry.resolved; // conteo ciego
  return entryReal(entry) !== null;
}

/** ¿El slot (1-3) tiene captura? Usa slotsFilled cuando las piezas están ocultas. */
export function slotFilled(entry: EntryLike, slot: 1 | 2 | 3): boolean {
  if (entry.slotsFilled) return entry.slotsFilled[slot - 1];
  const value = slot === 1 ? entry.count1 : slot === 2 ? entry.count2 : entry.count3;
  return value !== null;
}

export type RawCountEntry = {
  tagId: string;
  count1: number | null; count1ByName: string | null; count1At: string | null;
  count2: number | null; count2ByName: string | null;
  count3: number | null; count3ByName: string | null;
};

/**
 * Serializa una captura según el rol (CONTEO CIEGO). A quien puede ver piezas
 * (gerente/subgerente) se le mandan los valores; a quien no (asesor) se le
 * ocultan (count1/2/3 = null) pero se le manda el avance derivado, para que
 * sepa qué conteo le toca sin poder copiar lo que capturó otra persona.
 */
export function serializeEntry(entry: RawCountEntry, canSeePieces: boolean): SerializedEntry {
  const common = {
    tagId: entry.tagId,
    count1ByName: entry.count1ByName,
    count1At: entry.count1At,
    count2ByName: entry.count2ByName,
    count3ByName: entry.count3ByName,
    slotsFilled: [entry.count1 !== null, entry.count2 !== null, entry.count3 !== null] as [boolean, boolean, boolean],
    needsRecount: entryNeedsRecount(entry),
    resolved: entryReal(entry) !== null
  };
  return canSeePieces
    ? { ...common, count1: entry.count1, count2: entry.count2, count3: entry.count3 }
    : { ...common, count1: null, count2: null, count3: null };
}

// Contenido del QR impreso en cada marbete. Con prefijo propio para ignorar
// cualquier otro código (UPC de prendas, etiquetas de caja…) al escanear.
const QR_PREFIX = "CLVX:M:";

export function tagQrPayload(number: number): string {
  return `${QR_PREFIX}${number}`;
}

export function parseTagQr(text: string): number | null {
  if (!text.startsWith(QR_PREFIX)) return null;
  const parsed = parseInt(text.slice(QR_PREFIX.length), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export type ZoneProgress = {
  zone: CycleZone;
  total: number;
  counted: number;
  pieces: number;
  pendingNumbers: number[];
  discrepancies: number;
};

export function zoneProgress(
  zone: CycleZone,
  tags: Array<{ id: string; number: number; zone: CycleZone }>,
  entriesByTag: Map<string, EntryLike>
): ZoneProgress {
  const zoneTags = tags.filter((tag) => tag.zone === zone).sort((a, b) => a.number - b.number);
  let counted = 0;
  let pieces = 0;
  let discrepancies = 0;
  const pendingNumbers: number[] = [];
  for (const tag of zoneTags) {
    const entry = entriesByTag.get(tag.id);
    // "resuelto" no depende de ver las piezas: en conteo ciego el servidor lo
    // manda. Las piezas solo suman si están disponibles (0 para el asesor).
    if (!entry || !entryResolved(entry)) {
      pendingNumbers.push(tag.number);
    } else {
      counted += 1;
      pieces += entryReal(entry) ?? 0;
    }
    if (entry && entryNeedsRecount(entry)) discrepancies += 1;
  }
  return { zone, total: zoneTags.length, counted, pieces, pendingNumbers, discrepancies };
}
