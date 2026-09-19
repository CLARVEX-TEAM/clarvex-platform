-- Procedencia del binario: Android Key Attestation, en modo OBSERVAR.
--
-- Aditiva: columnas nuevas y anulables sobre una tabla existente, salvo
-- `provenance`, que lleva valor por omisión para las filas que ya están.
-- Ninguna fila cambia de comportamiento: nada bloquea todavía.

-- AlterTable
ALTER TABLE "NativeDevice" ADD COLUMN "provenance" TEXT NOT NULL DEFAULT 'PENDIENTE';
ALTER TABLE "NativeDevice" ADD COLUMN "attestation" JSONB;
ALTER TABLE "NativeDevice" ADD COLUMN "attestationAt" TIMESTAMP(3);
ALTER TABLE "NativeDevice" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "NativeDevice" ADD COLUMN "approvedAt" TIMESTAMP(3);
