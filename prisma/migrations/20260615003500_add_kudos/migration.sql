-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'KUDO';

-- CreateTable
CREATE TABLE "Kudo" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kudo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Kudo_storeId_createdAt_idx" ON "Kudo"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Kudo_toUserId_createdAt_idx" ON "Kudo"("toUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "Kudo" ADD CONSTRAINT "Kudo_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kudo" ADD CONSTRAINT "Kudo_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kudo" ADD CONSTRAINT "Kudo_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
