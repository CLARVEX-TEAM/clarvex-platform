/*
  Warnings:

  - You are about to drop the `InventoryBaseline` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `roundId` to the `InventoryMovement` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "InventoryBaseline" DROP CONSTRAINT "InventoryBaseline_storeId_fkey";

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "delivery" TEXT,
ADD COLUMN     "document" TEXT,
ADD COLUMN     "missing" INTEGER,
ADD COLUMN     "roundId" TEXT NOT NULL,
ADD COLUMN     "surplus" INTEGER;

-- DropTable
DROP TABLE "InventoryBaseline";

-- CreateTable
CREATE TABLE "InventoryRound" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "basePieces" INTEGER NOT NULL,
    "endDate" TIMESTAMP(3),
    "closingPieces" INTEGER,
    "countId" TEXT,
    "note" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryRound_storeId_startDate_idx" ON "InventoryRound"("storeId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryRound_storeId_startDate_key" ON "InventoryRound"("storeId", "startDate");

-- CreateIndex
CREATE INDEX "InventoryMovement_roundId_date_idx" ON "InventoryMovement"("roundId", "date");

-- AddForeignKey
ALTER TABLE "InventoryRound" ADD CONSTRAINT "InventoryRound_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "InventoryRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Una sola ronda ABIERTA por tienda. Prisma no sabe expresar un indice unico
-- parcial, asi que se crea a mano: sin el, dos capturas simultaneas podrian
-- abrir dos rondas y partir el kardex en dos historias incompatibles. La
-- comprobacion en codigo no basta porque hay dos instancias de PM2.
CREATE UNIQUE INDEX "InventoryRound_una_abierta_por_tienda"
  ON "InventoryRound"("storeId")
  WHERE "closedAt" IS NULL;
