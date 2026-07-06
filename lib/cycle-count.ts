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
};

export type EntryLike = {
  count1: number | null;
  count2: number | null;
  count3: number | null;
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
  return entry.count1 !== null && entry.count2 !== null && entry.count2 !== entry.count1 && entry.count3 === null;
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
    const real = entry ? entryReal(entry) : null;
    if (real === null) {
      pendingNumbers.push(tag.number);
    } else {
      counted += 1;
      pieces += real;
    }
    if (entry && entryNeedsRecount(entry)) discrepancies += 1;
  }
  return { zone, total: zoneTags.length, counted, pieces, pendingNumbers, discrepancies };
}
