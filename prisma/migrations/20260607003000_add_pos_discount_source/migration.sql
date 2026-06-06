ALTER TYPE "DataSourceType" ADD VALUE 'DESCUENTOS_POS';

ALTER TABLE "Kpi"
ADD COLUMN "grossSales" DECIMAL(12,2),
ADD COLUMN "discountAmount" DECIMAL(12,2),
ADD COLUMN "discountLimit" DECIMAL(5,2),
ALTER COLUMN "discountMargin" DROP DEFAULT,
ALTER COLUMN "discountMargin" DROP NOT NULL;

UPDATE "Kpi"
SET "discountMargin" = NULL
WHERE "grossSales" IS NULL OR "discountAmount" IS NULL;
