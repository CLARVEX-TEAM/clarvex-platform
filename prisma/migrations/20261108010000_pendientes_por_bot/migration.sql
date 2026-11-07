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
