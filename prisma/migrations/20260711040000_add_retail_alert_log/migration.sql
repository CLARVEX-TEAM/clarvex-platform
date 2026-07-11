-- CreateTable
CREATE TABLE "RetailAlertLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailAlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailAlertLog_storeId_periodKey_idx" ON "RetailAlertLog"("storeId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "RetailAlertLog_storeId_userId_periodKey_alertType_key" ON "RetailAlertLog"("storeId", "userId", "periodKey", "alertType");

-- AddForeignKey
ALTER TABLE "RetailAlertLog" ADD CONSTRAINT "RetailAlertLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
