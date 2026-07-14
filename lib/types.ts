export type Role = "GERENTE" | "SUBGERENTE" | "ASESOR" | "REGIONAL";
export type Priority = "baja" | "media" | "alta" | "critica";
export type PendingStatus = "pendiente" | "en proceso" | "completado";

export type User = {
  id: string;
  name: string;
  employeeNumber: string;
  role: Role;
  avatar: string;
  photoUrl?: string | null;
  biometricEnabled?: boolean;
  lastLoginAt?: string | null;
  storeName?: string;
  birthDate?: string | null;
  hireDate?: string | null;
  hoursOwed?: number;
  /** Días de vacaciones REALES que le quedan (ya descuenta lo tomado en Horarios). */
  vacationDays?: number;
  /** El número que gerencia capturó a mano, y de dónde salió el saldo de arriba. */
  vacationBaseline?: number;
  vacationEarned?: number;
  vacationTaken?: number;
  /** Ya capturadas en Horarios pero aún por venir: no descuentan todavía. */
  vacationPlanned?: number;
  paidDays?: number;
  active?: boolean;
  platformAdmin?: boolean;
};

export type Kpi = {
  userId: string;
  date?: string;
  dailySales: number;
  monthlySales: number;
  dailyGoal: number;
  monthlyGoal: number;
  avgTicket: number;
  upt: number;
  conversion: number | null;
  traffic: number | null;
  pieces: number;
  transactions: number;
  ranking: number;
  grossSales: number | null;
  discountAmount: number | null;
  discountMargin: number | null;
  discountLimit: number | null;
  commissionAmount: number;
  commissionPercent: number;
  commissionMinimum?: number | null;
};

export type Activity = {
  id: string;
  title: string;
  completed: boolean;
  autoKey?: string | null;
};

export type DayPlan = {
  id: string;
  userId: string;
  date: string;
  dailyGoal: number;
  focus: string;
  message: string;
  published?: boolean;
  activities: Activity[];
};

export type Pending = {
  id: string;
  title: string;
  description: string;
  category: "operacion" | "equipo" | "comercial" | "cliente" | "inventario" | "mantenimiento";
  priority: Priority;
  ownerId: string;
  status: PendingStatus;
  dueDate: string;
};

export type LogEntry = {
  id: string;
  date: string;
  authorId: string;
  category: string;
  description: string;
  evidenceUrl?: string | null;
};

export type AnnouncementReaction = {
  emoji: string;
  userId: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  authorId: string;
  date: string;
  readBy: string[];
  reactions: AnnouncementReaction[];
};

export type ScheduleShift = {
  id: string;
  userId: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** WORKING | OFF | VACATION | PAID_DAY | INVENTORY | TERMINATED */
  status: string;
  day: string;
  start: string;
  end: string;
  zone: string;
};

export type Evidence = {
  id: string;
  storeId: string;
  uploadedById: string;
  pendingId?: string | null;
  logEntryId?: string | null;
  taskId?: string | null;
  url: string;
  fileName?: string | null;
  mimeType?: string | null;
  note?: string | null;
  createdAt: string;
};

export type CommissionRule = {
  id: string;
  storeId: string;
  role?: Role | null;
  minSales: number;
  maxSales?: number | null;
  minAchievement: number;
  maxAchievement?: number | null;
  commissionPercent: number;
  active: boolean;
};
