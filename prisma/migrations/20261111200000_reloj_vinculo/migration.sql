-- Aditiva: vinculación del Pixel Watch por código corto y el bot.
CREATE TABLE "RelojVinculo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "secretoHash" TEXT NOT NULL,
    "userId" TEXT,
    "aprobadoAt" TIMESTAMP(3),
    "expiraAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelojVinculo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RelojVinculo_codigo_key" ON "RelojVinculo"("codigo");
CREATE UNIQUE INDEX "RelojVinculo_secretoHash_key" ON "RelojVinculo"("secretoHash");
CREATE INDEX "RelojVinculo_expiraAt_idx" ON "RelojVinculo"("expiraAt");
