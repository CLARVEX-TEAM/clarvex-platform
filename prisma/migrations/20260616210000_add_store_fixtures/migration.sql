-- Mapa de tienda: muebles/racks con su lista de estilos.
CREATE TABLE "StoreFixture" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "col" INTEGER NOT NULL DEFAULT 1,
    "row" INTEGER NOT NULL DEFAULT 1,
    "styles" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreFixture_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoreFixture_storeId_idx" ON "StoreFixture"("storeId");

ALTER TABLE "StoreFixture" ADD CONSTRAINT "StoreFixture_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
