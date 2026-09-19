-- Salud del equipo reportada por la APK, para que gerencia la vea sin tener el
-- teléfono en la mano.
--
-- Aditiva: dos columnas nuevas y anulables sobre una tabla existente. Ninguna
-- fila actual cambia, y la app anterior sigue funcionando sin escribirlas.

-- AlterTable
ALTER TABLE "NativeDevice" ADD COLUMN "health" JSONB;
ALTER TABLE "NativeDevice" ADD COLUMN "healthAt" TIMESTAMP(3);
