-- CreateEnum
CREATE TYPE "CommissionPayoutType" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "CommissionRule" ADD COLUMN     "fixedAmount" DECIMAL(12,2),
ADD COLUMN     "fixedAmountHigh" DECIMAL(12,2),
ADD COLUMN     "payoutType" "CommissionPayoutType" NOT NULL DEFAULT 'PERCENT';

-- CreateTable
CREATE TABLE "CommissionSeason" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionSeason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionSeason_storeId_startDate_endDate_idx" ON "CommissionSeason"("storeId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "CommissionSeason" ADD CONSTRAINT "CommissionSeason_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
