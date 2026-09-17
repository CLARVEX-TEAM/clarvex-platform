-- Identidad criptográfica de instalaciones Android. Las columnas nuevas son
-- aditivas: las APK anteriores siguen registrando FCM sin NativeDevice.
CREATE TABLE "NativeDevice" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "keyAlgorithm" TEXT NOT NULL DEFAULT 'ES256',
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "profile" TEXT NOT NULL DEFAULT 'PERSONAL',
    "appBuild" INTEGER NOT NULL,
    "appVersion" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "NativeDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NativeDeviceChallenge" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NativeDeviceChallenge_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DeviceToken" ADD COLUMN "nativeDeviceId" TEXT;

CREATE UNIQUE INDEX "NativeDevice_installationId_key" ON "NativeDevice"("installationId");
CREATE INDEX "NativeDevice_userId_status_idx" ON "NativeDevice"("userId", "status");
CREATE INDEX "NativeDevice_storeId_status_idx" ON "NativeDevice"("storeId", "status");
CREATE UNIQUE INDEX "NativeDeviceChallenge_nonce_key" ON "NativeDeviceChallenge"("nonce");
CREATE INDEX "NativeDeviceChallenge_installationId_purpose_expiresAt_idx" ON "NativeDeviceChallenge"("installationId", "purpose", "expiresAt");
CREATE INDEX "NativeDeviceChallenge_userId_createdAt_idx" ON "NativeDeviceChallenge"("userId", "createdAt");
CREATE INDEX "DeviceToken_nativeDeviceId_idx" ON "DeviceToken"("nativeDeviceId");

ALTER TABLE "NativeDevice"
  ADD CONSTRAINT "NativeDevice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NativeDevice"
  ADD CONSTRAINT "NativeDevice_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceToken"
  ADD CONSTRAINT "DeviceToken_nativeDeviceId_fkey"
  FOREIGN KEY ("nativeDeviceId") REFERENCES "NativeDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
