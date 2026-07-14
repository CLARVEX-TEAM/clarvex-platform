-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "uniformVariant" TEXT;

-- CreateTable
CREATE TABLE "UniformDay" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "womanTop" TEXT NOT NULL,
    "womanBottom" TEXT NOT NULL,
    "manTop" TEXT NOT NULL,
    "manBottom" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniformDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UniformDay_storeId_weekday_key" ON "UniformDay"("storeId", "weekday");

-- AddForeignKey
ALTER TABLE "UniformDay" ADD CONSTRAINT "UniformDay_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
