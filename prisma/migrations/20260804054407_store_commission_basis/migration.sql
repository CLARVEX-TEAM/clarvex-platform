-- CreateEnum
CREATE TYPE "CommissionBasis" AS ENUM ('MINIMO', 'META');

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "commissionBasis" "CommissionBasis" NOT NULL DEFAULT 'MINIMO';
