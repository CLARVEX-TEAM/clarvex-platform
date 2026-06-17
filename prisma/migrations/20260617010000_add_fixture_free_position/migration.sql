-- Posición libre en el plano 3D (reemplaza la cuadrícula col/row para mover).
ALTER TABLE "StoreFixture" ADD COLUMN "posX" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "StoreFixture" ADD COLUMN "posZ" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Coloca los muebles existentes según su antigua columna/fila.
UPDATE "StoreFixture" SET "posX" = "col" * 2.6, "posZ" = "row" * 2.6;
