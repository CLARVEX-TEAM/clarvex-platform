// Cálculo de rachas (días laborados consecutivos cumpliendo la meta diaria).
// Pura y testeable; no toca KPIs/comisiones/parsers.

export type StreakRow = { date: string; sales: number; goal: number };

export type StreakResult = { current: number; best: number };

/**
 * Racha de días cumpliendo meta. Solo cuentan días laborados (meta > 0); los días
 * de descanso (meta 0) se omiten y NO rompen la racha. Se ignoran días futuros.
 */
export function computeDailyStreak(rows: StreakRow[], todayKey: string): StreakResult {
  const days = rows
    .filter((row) => row.goal > 0 && row.date <= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date)); // cronológico ascendente

  let best = 0;
  let run = 0;
  for (const day of days) {
    if (day.sales >= day.goal) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }

  // Racha actual = corrida que termina en el día más reciente con datos.
  let current = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].sales >= days[index].goal) current += 1;
    else break;
  }

  return { current, best };
}
