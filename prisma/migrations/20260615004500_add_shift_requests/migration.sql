-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SHIFT_REQUEST';

-- CreateTable
CREATE TABLE "ShiftRequest" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "managerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftRequest_storeId_status_date_idx" ON "ShiftRequest"("storeId", "status", "date");

-- CreateIndex
CREATE INDEX "ShiftRequest_requesterId_createdAt_idx" ON "ShiftRequest"("requesterId", "createdAt");

-- AddForeignKey
ALTER TABLE "ShiftRequest" ADD CONSTRAINT "ShiftRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRequest" ADD CONSTRAINT "ShiftRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
