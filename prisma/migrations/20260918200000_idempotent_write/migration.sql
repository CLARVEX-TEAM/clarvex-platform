-- Una escritura que ya se hizo, para que un reintento no la repita.
--
-- Aditiva: crea una tabla nueva y no toca ninguna existente.

-- CreateTable
CREATE TABLE "IdempotentWrite" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "status" INTEGER,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotentWrite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- La clave es única DENTRO de la tienda: una tienda no puede pisar ni leer la
-- operación de otra adivinando una clave. Y es el índice el que arbitra dos
-- intentos simultáneos; sin él, los dos pasarían por el hueco entre la consulta
-- y la escritura.
CREATE UNIQUE INDEX "IdempotentWrite_storeId_key_key" ON "IdempotentWrite"("storeId", "key");

-- CreateIndex
CREATE INDEX "IdempotentWrite_createdAt_idx" ON "IdempotentWrite"("createdAt");
