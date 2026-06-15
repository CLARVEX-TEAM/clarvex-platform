// Reglas de tareas operativas del plan del día y rotación justa entre asesores.
// Día de la semana en UTC: Domingo=0, Lunes=1 … Sábado=6.

export type ChoreKey = "CICLICO" | "BARRER_MOPEAR" | "TRAPEAR" | "VIDRIOS" | "VISUAL";

export type Chore = {
  key: ChoreKey;
  label: string;
  days: number[]; // días (UTC) en que aplica
  rotating: boolean; // true = un asesor rotativo; false = todos los que trabajan
};

export const CHORES: Chore[] = [
  { key: "CICLICO", label: "Conteo cíclico", days: [1, 2, 3, 4], rotating: true },
  { key: "BARRER_MOPEAR", label: "Barrer y mopear", days: [0, 1, 2, 3, 4, 5, 6], rotating: true },
  { key: "TRAPEAR", label: "Trapear", days: [2, 4, 6], rotating: true },
  { key: "VIDRIOS", label: "Limpiar vidrios", days: [2, 4, 6], rotating: true },
  { key: "VISUAL", label: "Trabajar en visual", days: [1, 2, 3], rotating: false }
];

export const CHORE_LABELS: Record<ChoreKey, string> = CHORES.reduce(
  (acc, chore) => ({ ...acc, [chore.key]: chore.label }),
  {} as Record<ChoreKey, string>
);

// Orden de asignación de las rotativas (prioridad para el reparto del día).
export const ROTATING_ORDER: ChoreKey[] = ["CICLICO", "TRAPEAR", "VIDRIOS", "BARRER_MOPEAR"];

export function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
}

export function choresForWeekday(weekday: number): Chore[] {
  return CHORES.filter((chore) => chore.days.includes(weekday));
}

// Título de la actividad. El miércoles (3) visual incluye la entrega del RF en evidencias.
export function choreTitle(key: ChoreKey, weekday: number): string {
  if (key === "VISUAL" && weekday === 3) return "Trabajar en visual y subir fotos del RF (evidencia)";
  return CHORE_LABELS[key];
}

export type Counts = Record<string, Record<string, number>>; // counts[choreKey][userId] = veces

function countFor(counts: Counts, choreKey: ChoreKey, userId: string): number {
  return counts[choreKey]?.[userId] ?? 0;
}

function totalFor(counts: Counts, userId: string): number {
  return ROTATING_ORDER.reduce((sum, key) => sum + countFor(counts, key, userId), 0);
}

export type Assignment = {
  rotating: Partial<Record<ChoreKey, string>>; // choreKey -> userId
  shared: ChoreKey[]; // tareas compartidas (visual) que aplican hoy
};

/**
 * Asigna las tareas operativas del día.
 * - Rotativas: por cada tarea aplicable (en ROTATING_ORDER) elige al asesor que trabaja con
 *   menor conteo histórico de esa tarea. Desempate: (a) que no tenga ya otra tarea hoy (reparto),
 *   (b) menor conteo total, (c) orden estable por id. Esto compensa al que hizo doble.
 * - Compartidas (visual): se marcan para todos los que trabajan.
 */
export function assignChores({
  workingAdvisorIds,
  weekday,
  counts
}: {
  workingAdvisorIds: string[];
  weekday: number;
  counts: Counts;
}): Assignment {
  const rotating: Partial<Record<ChoreKey, string>> = {};
  const shared: ChoreKey[] = [];
  const assignedToday: Record<string, number> = {};
  const todaysChores = choresForWeekday(weekday);

  for (const key of ROTATING_ORDER) {
    if (!todaysChores.some((chore) => chore.key === key)) continue;
    if (workingAdvisorIds.length === 0) continue;
    const ordered = [...workingAdvisorIds].sort((a, b) => {
      const byChore = countFor(counts, key, a) - countFor(counts, key, b);
      if (byChore !== 0) return byChore;
      const byToday = (assignedToday[a] ?? 0) - (assignedToday[b] ?? 0);
      if (byToday !== 0) return byToday;
      const byTotal = totalFor(counts, a) - totalFor(counts, b);
      if (byTotal !== 0) return byTotal;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    const chosen = ordered[0];
    rotating[key] = chosen;
    assignedToday[chosen] = (assignedToday[chosen] ?? 0) + 1;
  }

  for (const chore of todaysChores) {
    if (!chore.rotating) shared.push(chore.key);
  }

  return { rotating, shared };
}
