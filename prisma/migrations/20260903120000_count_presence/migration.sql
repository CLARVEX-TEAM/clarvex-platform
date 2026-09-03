-- Presencia efimera de conteos, compartida entre los procesos de PM2.
--
-- Antes vivia en un Map de proceso con el comentario «valido porque la app
-- corre en un solo proceso PM2». PM2 corre en CLUSTER con dos instancias: el
-- latido caia en uno y la lectura en el otro, asi que la presencia aparecia y
-- desaparecia sola.
--
-- Aditiva: crea una tabla nueva y no toca ninguna existente, asi que la version
-- anterior del codigo sigue funcionando si hubiera que volver atras.
CREATE TABLE "CountPresence" (
    "id" TEXT NOT NULL,
    "countKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "tagNumber" INTEGER,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountPresence_pkey" PRIMARY KEY ("id")
);

-- Una fila por persona y conteo: el latido es un upsert, no un insert.
CREATE UNIQUE INDEX "CountPresence_countKey_userId_key" ON "CountPresence"("countKey", "userId");

-- Para leer los vivos y barrer los caducados.
CREATE INDEX "CountPresence_countKey_at_idx" ON "CountPresence"("countKey", "at");
