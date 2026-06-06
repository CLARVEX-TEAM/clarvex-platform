-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('WORKING', 'OFF', 'VACATION', 'PAID_DAY', 'INVENTORY', 'TERMINATED');

-- AlterTable
ALTER TABLE "Schedule"
ADD COLUMN "date" TIMESTAMP(3),
ADD COLUMN "status" "ScheduleStatus" NOT NULL DEFAULT 'WORKING',
ADD COLUMN "statusRaw" TEXT,
ALTER COLUMN "startTime" DROP NOT NULL;

-- Preserve existing demo schedules by deriving their calendar date from weekStart and day.
UPDATE "Schedule"
SET "date" = "weekStart" + CASE "day"
  WHEN 'Dom' THEN INTERVAL '0 day'
  WHEN 'Lun' THEN INTERVAL '1 day'
  WHEN 'Mar' THEN INTERVAL '2 days'
  WHEN 'Mie' THEN INTERVAL '3 days'
  WHEN 'Mié' THEN INTERVAL '3 days'
  WHEN 'Jue' THEN INTERVAL '4 days'
  WHEN 'Vie' THEN INTERVAL '5 days'
  WHEN 'Sab' THEN INTERVAL '6 days'
  WHEN 'Sáb' THEN INTERVAL '6 days'
  ELSE INTERVAL '0 day'
END;

ALTER TABLE "Schedule" ALTER COLUMN "date" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_userId_date_key" ON "Schedule"("userId", "date");
CREATE INDEX "Schedule_storeId_date_idx" ON "Schedule"("storeId", "date");
