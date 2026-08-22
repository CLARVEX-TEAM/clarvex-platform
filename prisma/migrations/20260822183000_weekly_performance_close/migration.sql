CREATE TYPE "WeeklyPerformanceStatus" AS ENUM ('DRAFT', 'FINALIZED');

CREATE TABLE "WeeklyPerformanceClose" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "status" "WeeklyPerformanceStatus" NOT NULL DEFAULT 'DRAFT',
    "upliftPercent" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "whatsappBudget" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "plan" JSONB NOT NULL,
    "snapshot" JSONB,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "finalizedBy" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WeeklyPerformanceClose_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeeklyPerformanceClose_storeId_weekStart_key" ON "WeeklyPerformanceClose"("storeId", "weekStart");
CREATE INDEX "WeeklyPerformanceClose_storeId_status_weekStart_idx" ON "WeeklyPerformanceClose"("storeId", "status", "weekStart");

ALTER TABLE "WeeklyPerformanceClose" ADD CONSTRAINT "WeeklyPerformanceClose_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
