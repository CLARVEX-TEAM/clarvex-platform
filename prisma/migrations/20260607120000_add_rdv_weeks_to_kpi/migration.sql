ALTER TABLE "Kpi"
ADD COLUMN "weekNumber" INTEGER,
ADD COLUMN "weekStart" TIMESTAMP(3),
ADD COLUMN "weekEnd" TIMESTAMP(3);

CREATE INDEX "Kpi_storeId_weekStart_weekNumber_idx"
ON "Kpi"("storeId", "weekStart", "weekNumber");
