-- CreateEnum
CREATE TYPE "KpiImportSource" AS ENUM ('RDV', 'POWER_BI');

-- AlterTable
ALTER TABLE "Kpi" ADD COLUMN "importSource" "KpiImportSource" NOT NULL DEFAULT 'RDV';
