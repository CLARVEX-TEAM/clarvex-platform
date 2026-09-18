-- APK 1.6: solicitudes de corrección de asistencia desde Mi día.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECTION';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SHIFT_REMINDER';

CREATE TABLE "AttendanceCorrectionRequest" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "requestedStatus" "AttendanceStatus" NOT NULL,
  "requestedArrivedAt" TEXT,
  "requestedLeftAt" TEXT,
  "reason" TEXT NOT NULL,
  "evidenceUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "managerNote" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AttendanceCorrectionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendanceCorrectionRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AttendanceCorrectionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AttendanceCorrectionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AttendanceCorrectionRequest_storeId_status_createdAt_idx"
  ON "AttendanceCorrectionRequest"("storeId", "status", "createdAt");

CREATE INDEX "AttendanceCorrectionRequest_userId_date_createdAt_idx"
  ON "AttendanceCorrectionRequest"("userId", "date", "createdAt");
