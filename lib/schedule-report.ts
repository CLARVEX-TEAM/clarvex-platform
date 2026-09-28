import { dateKey } from "@/lib/schedule-week";
import type { Role } from "@/lib/types";

export type ScheduleViewStatus = "WORKING" | "OFF" | "VACATION" | "PAID_DAY" | "INVENTORY" | "TERMINATED" | "UNKNOWN";

type ScheduleUser = {
  id: string;
  name: string;
  role: Role;
  photoUrl: string | null;
};

type ScheduleRecord = {
  id: string;
  userId: string;
  date: Date;
  day: string;
  status: Exclude<ScheduleViewStatus, "UNKNOWN">;
  statusRaw: string | null;
  startTime: string | null;
  endTime: string | null;
  zone: string | null;
};

export function buildWeeklySchedule(users: ScheduleUser[], schedules: ScheduleRecord[], weekStart: Date) {
  const scheduleByUserDate = new Map<string, ScheduleRecord>();
  for (const schedule of schedules) {
    const key = `${schedule.userId}:${dateKey(schedule.date)}`;
    const current = scheduleByUserDate.get(key);
    if (!current || recordQuality(schedule) > recordQuality(current)) scheduleByUserDate.set(key, schedule);
  }
  const days = Array.from({ length: 7 }, (_, index) => new Date(weekStart.getTime() + index * 86_400_000));

  return users.flatMap((user) => days.map((date) => {
    const key = dateKey(date);
    const schedule = scheduleByUserDate.get(`${user.id}:${key}`);
    return {
      id: schedule?.id ?? `unknown:${user.id}:${key}`,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      photoUrl: user.photoUrl,
      date: key,
      day: schedule?.day ?? dayName(date),
      status: (schedule?.status ?? "UNKNOWN") as ScheduleViewStatus,
      statusRaw: schedule?.statusRaw ?? null,
      startTime: schedule?.startTime ?? null,
      endTime: schedule?.endTime ?? null,
      zone: schedule?.zone ?? null
    };
  }));
}

function recordQuality(schedule: ScheduleRecord) {
  return (schedule.statusRaw ? 2 : 0) + (schedule.date.getUTCHours() === 0 ? 1 : 0);
}

function dayName(date: Date) {
  return ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"][date.getUTCDay()];
}

/**
 * Quién más entra ese día — «¿con quién me toca?».
 *
 * ⚠️ Esta función decide sobre una FRONTERA DE ROLES. `CLAUDE.md` dice que un
 * asesor ve sus propios horarios y solo gerencia ve los del equipo; esto es la
 * única excepción, y está acotada a contestar esa pregunta y nada más. Vive
 * aquí, separada de Prisma, para que se pueda probar de verdad: `lib/prisma`
 * lanza fuera de la configuración de integración, así que una regla escrita
 * dentro del handler no se puede cubrir. Es la misma razón por la que
 * `lib/attendance-roll-call-plan.ts` existe aparte.
 *
 * Tres reglas, y las tres importan:
 *
 *   1. Solo quien TRABAJA. Quién descansa o está de vacaciones no es un
 *      compañero de turno: es información privada de esa persona.
 *   2. Uno mismo NUNCA sale en su propia lista.
 *   3. Se devuelve el MÍNIMO -- nombre, foto y horas. Sin estado crudo, sin
 *      zona, sin id de horario: con eso no se reconstruye el historial de
 *      nadie.
 */
export type CompaneroDeTurno = {
  date: string;
  userId: string;
  userName: string;
  photoUrl: string | null;
  startTime: string | null;
  endTime: string | null;
};

export function companerosDeTurno(
  filas: ReadonlyArray<{
    date: string;
    status: string;
    startTime: string | null;
    endTime: string | null;
    user: { id: string; name: string; photoUrl: string | null };
  }>,
  miUserId: string
): CompaneroDeTurno[] {
  return filas
    .filter((fila) => fila.status === "WORKING" && fila.user.id !== miUserId)
    .map((fila) => ({
      date: fila.date,
      userId: fila.user.id,
      userName: fila.user.name,
      photoUrl: fila.user.photoUrl,
      startTime: fila.startTime,
      endTime: fila.endTime
    }));
}
