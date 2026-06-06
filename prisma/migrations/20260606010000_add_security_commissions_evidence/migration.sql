-- User security/profile fields
ALTER TABLE "User" ADD COLUMN "pinHash" TEXT;
ALTER TABLE "User" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "biometricEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- KPI commercial fields
ALTER TABLE "Kpi" ADD COLUMN "discountMargin" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "Kpi" ADD COLUMN "commissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Kpi" ADD COLUMN "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Evidence attachments for future uploads
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "pendingId" TEXT,
    "logEntryId" TEXT,
    "taskId" TEXT,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- Commission rules by store and optional role
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "role" "Role",
    "minSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "maxSales" DECIMAL(12,2),
    "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_pendingId_fkey" FOREIGN KEY ("pendingId") REFERENCES "Pending"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_logEntryId_fkey" FOREIGN KEY ("logEntryId") REFERENCES "StoreLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
