-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEPCION', 'TRANSFERENCIA_ENTRADA', 'DEVOLUCION_CLIENTE', 'TRANSFERENCIA_SALIDA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO');

-- CreateTable
CREATE TABLE "InventoryBaseline" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "pieces" INTEGER NOT NULL,
    "countId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reference" TEXT,
    "counterpart" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBaseline_storeId_key" ON "InventoryBaseline"("storeId");

-- CreateIndex
CREATE INDEX "InventoryMovement_storeId_date_idx" ON "InventoryMovement"("storeId", "date");

-- AddForeignKey
ALTER TABLE "InventoryBaseline" ADD CONSTRAINT "InventoryBaseline_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
