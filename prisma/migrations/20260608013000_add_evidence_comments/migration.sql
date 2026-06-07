ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMMENT_ADDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EVIDENCE_ADDED';

CREATE TABLE "Comment" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "pendingId" TEXT,
  "taskId" TEXT,
  "logEntryId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Evidence_storeId_pendingId_idx" ON "Evidence"("storeId", "pendingId");
CREATE INDEX "Evidence_storeId_taskId_idx" ON "Evidence"("storeId", "taskId");
CREATE INDEX "Evidence_storeId_logEntryId_idx" ON "Evidence"("storeId", "logEntryId");
CREATE INDEX "Comment_storeId_pendingId_createdAt_idx" ON "Comment"("storeId", "pendingId", "createdAt");
CREATE INDEX "Comment_storeId_taskId_createdAt_idx" ON "Comment"("storeId", "taskId", "createdAt");
CREATE INDEX "Comment_storeId_logEntryId_createdAt_idx" ON "Comment"("storeId", "logEntryId", "createdAt");

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_pendingId_fkey" FOREIGN KEY ("pendingId") REFERENCES "Pending"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_logEntryId_fkey" FOREIGN KEY ("logEntryId") REFERENCES "StoreLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
