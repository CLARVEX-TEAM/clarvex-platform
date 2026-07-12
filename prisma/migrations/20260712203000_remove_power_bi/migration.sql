-- DropTable
DROP TABLE IF EXISTS "StorePowerBiConnection";

-- DropEnum
DROP TYPE IF EXISTS "PowerBiAuthMode";

-- AlterTable
ALTER TABLE "Kpi" DROP COLUMN IF EXISTS "importSource";

-- DropEnum
DROP TYPE IF EXISTS "KpiImportSource";
