-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DAILY_SUMMARY';

-- CreateTable
CREATE TABLE "DailyNotificationLog" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT true,
    "case" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyNotificationLog_employeeId_date_key" ON "DailyNotificationLog"("employeeId", "date");

-- CreateIndex
CREATE INDEX "DailyNotificationLog_date_idx" ON "DailyNotificationLog"("date");
