// Cálculos de cumpleaños y aniversarios. Fechas en formato "YYYY-MM-DD". Pura y testeable.

/** True si la fecha cae el mismo día y mes que hoy (sin importar el año). */
export function isSameMonthDay(dateKey: string, todayKey: string): boolean {
  return dateKey.slice(5) === todayKey.slice(5);
}

/** Años completos transcurridos entre dateKey y hoy (edad / antigüedad cumplida HOY). */
export function yearsSince(dateKey: string, todayKey: string): number {
  return Number(todayKey.slice(0, 4)) - Number(dateKey.slice(0, 4));
}

/** Número de años que cumplirá en la PRÓXIMA ocurrencia del día/mes. */
export function upcomingYears(dateKey: string, todayKey: string): number {
  const todayYear = Number(todayKey.slice(0, 4));
  const upcomingYear = dateKey.slice(5) >= todayKey.slice(5) ? todayYear : todayYear + 1;
  return upcomingYear - Number(dateKey.slice(0, 4));
}

/** Días hasta la próxima ocurrencia del día/mes (0 si es hoy). */
export function daysUntilMonthDay(dateKey: string, todayKey: string): number {
  const [, month, day] = dateKey.split("-").map(Number);
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const today = Date.UTC(ty, tm - 1, td);
  let next = Date.UTC(ty, month - 1, day);
  if (next < today) next = Date.UTC(ty + 1, month - 1, day);
  return Math.round((next - today) / 86_400_000);
}

export type CelebrationPerson = { id: string; name: string; birthDate?: string | null; hireDate?: string | null };
export type UpcomingCelebration = { id: string; name: string; type: "cumple" | "aniversario"; date: string; daysUntil: number; years: number };

/** Próximos cumpleaños y aniversarios dentro de `withinDays`, ordenados por cercanía. */
export function upcomingCelebrations(people: CelebrationPerson[], todayKey: string, withinDays = 30): UpcomingCelebration[] {
  const result: UpcomingCelebration[] = [];
  for (const person of people) {
    if (person.birthDate) {
      const daysUntil = daysUntilMonthDay(person.birthDate, todayKey);
      if (daysUntil <= withinDays) {
        result.push({ id: person.id, name: person.name, type: "cumple", date: person.birthDate, daysUntil, years: upcomingYears(person.birthDate, todayKey) });
      }
    }
    if (person.hireDate) {
      const daysUntil = daysUntilMonthDay(person.hireDate, todayKey);
      const years = upcomingYears(person.hireDate, todayKey);
      if (daysUntil <= withinDays && years >= 1) {
        result.push({ id: person.id, name: person.name, type: "aniversario", date: person.hireDate, daysUntil, years });
      }
    }
  }
  return result.sort((a, b) => a.daysUntil - b.daysUntil);
}
