-- Conteo diario por sección (dama), a raíz del inventario de agosto de 2026.
--
-- El juego de marbetes de la sección se arma solo: el primer conteo enrola cada
-- marbete que se escanea y le fija su posición de export. Esa posición NO se
-- recicla nunca (ver `sectionPosition` en el esquema).

ALTER TABLE "CycleCountTag" ADD COLUMN "section" TEXT;
ALTER TABLE "CycleCountTag" ADD COLUMN "sectionPosition" INTEGER;

-- Los marbetes existentes quedan con section NULL. En Postgres dos NULL no son
-- iguales, así que el índice único no los estorba entre sí.
CREATE UNIQUE INDEX "CycleCountTag_storeId_section_sectionPosition_key"
  ON "CycleCountTag"("storeId", "section", "sectionPosition");
CREATE INDEX "CycleCountTag_storeId_section_idx"
  ON "CycleCountTag"("storeId", "section");

-- Los conteos que ya existen son todos físicos: el default los cubre sin tocar
-- ninguna fila a mano.
ALTER TABLE "CycleCount" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'FISICO';
ALTER TABLE "CycleCount" ADD COLUMN "section" TEXT;

ALTER TABLE "CycleCountEntry" ADD COLUMN "reason" TEXT;
ALTER TABLE "CycleCountEntry" ADD COLUMN "reasonRef" TEXT;
