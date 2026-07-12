-- CreateEnum
CREATE TYPE "PowerBiAuthMode" AS ENUM ('OAUTH', 'DEVTOOLS');

-- AlterTable
ALTER TABLE "StorePowerBiConnection" ADD COLUMN "authMode" "PowerBiAuthMode" NOT NULL DEFAULT 'OAUTH';
ALTER TABLE "StorePowerBiConnection" ADD COLUMN "encryptedAccessToken" TEXT;
ALTER TABLE "StorePowerBiConnection" ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "StorePowerBiConnection" ALTER COLUMN "encryptedRefreshToken" DROP NOT NULL;
