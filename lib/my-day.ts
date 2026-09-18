import type { AttendanceStatus } from "@prisma/client";

export type MyDayShift = {
  status: string;
  start: string | null;
  end: string | null;
  zone: string | null;
};

export type MyDayAttendance = {
  status: AttendanceStatus;
  expectedAt: string | null;
  arrivedAt: string | null;
  expectedLeaveAt: string | null;
  leftAt: string | null;
  minutesLate: number;
} | null;

export function progressPercent(value: number, goal: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(goal) || goal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / goal) * 100)));
}

export function shiftSummary(shift: MyDayShift | null): string {
  if (!shift) return "Horario pendiente de cargar";
  if (shift.status !== "WORKING" && shift.status !== "INVENTORY") {
    const labels: Record<string, string> = {
      OFF: "Día de descanso",
      VACATION: "Vacaciones",
      PAID_DAY: "Pago de día",
      TERMINATED: "Sin turno"
    };
    return labels[shift.status] ?? "Sin jornada programada";
  }
  if (!shift.start && !shift.end) return shift.status === "INVENTORY" ? "Inventario" : "Jornada programada";
  return `${shift.start || "Entrada pendiente"}${shift.end ? `–${shift.end}` : ""}${shift.zone ? ` · ${shift.zone}` : ""}`;
}

export function attendanceLabel(attendance: MyDayAttendance): string {
  if (!attendance) return "Sin registro de entrada";
  const labels: Record<AttendanceStatus, string> = {
    ON_TIME: "Entrada a tiempo",
    LATE: "Retardo registrado",
    ABSENT: "Ausencia registrada",
    EXCUSED: "Ausencia justificada",
    REST: "Descanso",
    VACATION: "Vacaciones",
    PAID_DAY: "Pago de día",
    INVENTORY: "Inventario"
  };
  return labels[attendance.status];
}

export function correctionStatusLabel(status: string): string {
  if (status === "APPROVED") return "Aprobada";
  if (status === "REJECTED") return "No aprobada";
  return "En revisión";
}
