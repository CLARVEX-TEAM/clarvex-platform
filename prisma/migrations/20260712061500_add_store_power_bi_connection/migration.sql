-- CreateTable
CREATE TABLE "StorePowerBiConnection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "msAccountEmail" TEXT,
    "encryptedRefreshToken" TEXT NOT NULL,
    "exportUrl" TEXT NOT NULL,
    "exportPayloadTemplate" JSONB NOT NULL,
    "connectedByUserId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorePowerBiConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorePowerBiConnection_storeId_key" ON "StorePowerBiConnection"("storeId");

-- CreateIndex
CREATE INDEX "StorePowerBiConnection_connectedByUserId_idx" ON "StorePowerBiConnection"("connectedByUserId");

-- AddForeignKey
ALTER TABLE "StorePowerBiConnection" ADD CONSTRAINT "StorePowerBiConnection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorePowerBiConnection" ADD CONSTRAINT "StorePowerBiConnection_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
