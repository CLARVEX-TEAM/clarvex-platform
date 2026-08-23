ALTER TABLE "WeeklyPerformanceClose"
  ADD COLUMN "quotaSavedAt" TIMESTAMP(3),
  ADD COLUMN "quotaSavedBy" TEXT,
  ADD COLUMN "reportSnapshot" JSONB,
  ADD COLUMN "reportSavedAt" TIMESTAMP(3),
  ADD COLUMN "reportSavedBy" TEXT;

-- Los registros existentes nacieron al guardar Cuota Justa. Solo los cierres
-- FINALIZED contenian tambien una copia congelada del RDS.
UPDATE "WeeklyPerformanceClose"
SET
  "quotaSavedAt" = "updatedAt",
  "quotaSavedBy" = "updatedBy";

UPDATE "WeeklyPerformanceClose"
SET
  "reportSnapshot" = "snapshot",
  "reportSavedAt" = "finalizedAt",
  "reportSavedBy" = "finalizedBy"
WHERE "status" = 'FINALIZED';
