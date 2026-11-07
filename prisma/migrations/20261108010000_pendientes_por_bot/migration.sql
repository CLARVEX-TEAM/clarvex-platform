-- Pendientes por el bot de WhatsApp. Aditiva: una columna opcional y una tabla.
ALTER TABLE "Pending" ADD COLUMN "cierreSolicitadoAt" TIMESTAMP(3);

CREATE TABLE "BotEspera" (
    "userId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "expiraAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotEspera_pkey" PRIMARY KEY ("userId")
);

-- Pendientes de tipo CURSO: una matriz de cursos, cada uno con su certificado.
ALTER TABLE "Pending" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'PENDIENTE';

CREATE TABLE "PendingCurso" (
    "id" TEXT NOT NULL,
    "pendingId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "completadoAt" TIMESTAMP(3),
    "evidenceId" TEXT,

    CONSTRAINT "PendingCurso_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingCurso_pendingId_orden_key" ON "PendingCurso"("pendingId", "orden");

ALTER TABLE "PendingCurso" ADD CONSTRAINT "PendingCurso_pendingId_fkey" FOREIGN KEY ("pendingId") REFERENCES "Pending"("id") ON DELETE CASCADE ON UPDATE CASCADE;
