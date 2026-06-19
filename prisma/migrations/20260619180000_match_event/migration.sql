-- Partidos de la Selección Mexicana (tema + notificaciones de gol)
CREATE TABLE "MatchEvent" (
    "id" TEXT NOT NULL,
    "opponent" TEXT NOT NULL,
    "opponentFlag" TEXT,
    "competition" TEXT,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "mxScore" INTEGER NOT NULL DEFAULT 0,
    "rivalScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MatchEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MatchEvent_kickoff_idx" ON "MatchEvent"("kickoff");
CREATE INDEX "MatchEvent_status_idx" ON "MatchEvent"("status");
