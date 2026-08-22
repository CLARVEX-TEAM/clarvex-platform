export type ScheduleStatusRow = { userId: string; date: Date; status: string; statusRaw: string | null };

// Mejor registro de horario por usuario y día: el sync puede guardar duplicados
// con distinta calidad (statusRaw explícito > fila normalizada a medianoche).
// Devuelve las llaves `userId:YYYY-MM-DD` de los días laborados (WORKING).
export function buildWorkingScheduleKeys(schedules: ScheduleStatusRow[]): Set<string> {
  const byUserDate = new Map<string, { status: string; quality: number }>();
  for (const schedule of schedules) {
    const key = `${schedule.userId}:${schedule.date.toISOString().slice(0, 10)}`;
    const quality = (schedule.statusRaw ? 2 : 0) + (schedule.date.getUTCHours() === 0 ? 1 : 0);
    if (!byUserDate.has(key) || quality > byUserDate.get(key)!.quality) byUserDate.set(key, { status: schedule.status, quality });
  }
  return new Set(
    Array.from(byUserDate.entries())
      .filter(([, entry]) => entry.status === "WORKING" || entry.status === "INVENTORY")
      .map(([key]) => key)
  );
}
