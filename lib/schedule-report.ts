import { dateKey } from "@/lib/schedule-week";

export type ScheduleViewStatus = "WORKING" | "OFF" | "VACATION" | "PAID_DAY" | "INVENTORY" | "TERMINATED" | "UNKNOWN";

type ScheduleUser = {
  id: string;
  name: string;
  role: "GERENTE" | "SUBGERENTE" | "ASESOR";
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
