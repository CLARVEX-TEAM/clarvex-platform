-- CreateIndex
CREATE INDEX "RetailAlertLog_userId_idx" ON "RetailAlertLog"("userId");

-- AddForeignKey
ALTER TABLE "RetailAlertLog" ADD CONSTRAINT "RetailAlertLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
