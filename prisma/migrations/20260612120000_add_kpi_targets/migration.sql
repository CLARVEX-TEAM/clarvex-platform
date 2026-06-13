-- CreateTable
CREATE TABLE "KpiTarget" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "period" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KpiTarget_storeId_idx" ON "KpiTarget"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "KpiTarget_storeId_metric_period_key" ON "KpiTarget"("storeId", "metric", "period");

-- AddForeignKey
ALTER TABLE "KpiTarget" ADD CONSTRAINT "KpiTarget_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
