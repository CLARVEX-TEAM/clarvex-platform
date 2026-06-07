ALTER TABLE "Kpi"
ADD COLUMN "traffic" INTEGER;

ALTER TABLE "Kpi"
ALTER COLUMN "conversion" DROP NOT NULL;

UPDATE "Kpi"
SET "conversion" = NULL
WHERE "traffic" IS NULL OR "traffic" = 0;
