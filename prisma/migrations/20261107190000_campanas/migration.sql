-- Campañas de la tienda: Tailored Help 2026 (donativos en caja para Christel House).
--
-- Aditiva: tres tablas nuevas, ninguna columna en tablas existentes.
--
-- La meta la manda el corporativo por TIENDA y por DÍA, una semana a la vez; lo
-- que junta cada quien no viene en el reporte del POS y lo captura gerencia a
-- mano. Por eso son dos tablas: la meta no pertenece a ninguna persona.
-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignGoal" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignEntry" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignGoal_campaignId_storeId_date_key" ON "CampaignGoal"("campaignId", "storeId", "date");

-- CreateIndex
CREATE INDEX "CampaignEntry_campaignId_storeId_date_idx" ON "CampaignEntry"("campaignId", "storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignEntry_campaignId_userId_date_key" ON "CampaignEntry"("campaignId", "userId", "date");

-- AddForeignKey
ALTER TABLE "CampaignGoal" ADD CONSTRAINT "CampaignGoal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignGoal" ADD CONSTRAINT "CampaignGoal_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEntry" ADD CONSTRAINT "CampaignEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEntry" ADD CONSTRAINT "CampaignEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEntry" ADD CONSTRAINT "CampaignEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- La campaña arranca el domingo 1 de noviembre de 2026 (semana retail 44).
INSERT INTO "Campaign" ("id", "slug", "name", "startDate", "active")
VALUES ('tailored-help-2026', 'tailored-help-2026', 'Tailored Help 2026', DATE '2026-11-01', true)
ON CONFLICT ("slug") DO NOTHING;

-- Metas que mandó el corporativo para Monterrey San Agustín (semanas 44 y 45).
-- Solo si la tienda existe: en una base de pruebas no hay nada que sembrar.
INSERT INTO "CampaignGoal" ("id", "campaignId", "storeId", "date", "amount", "updatedBy", "updatedAt")
SELECT 'th26-' || s.id || '-' || to_char(v.d, 'YYYYMMDD'), 'tailored-help-2026', s.id, v.d, v.a, 'migracion', CURRENT_TIMESTAMP
FROM "Store" s
CROSS JOIN (VALUES
  (DATE '2026-11-01', 43), (DATE '2026-11-02', 22), (DATE '2026-11-03', 22), (DATE '2026-11-04', 22),
  (DATE '2026-11-05', 22), (DATE '2026-11-06', 33), (DATE '2026-11-07', 54),
  (DATE '2026-11-08', 43), (DATE '2026-11-09', 22), (DATE '2026-11-10', 22), (DATE '2026-11-11', 43),
  (DATE '2026-11-12', 43), (DATE '2026-11-13', 54), (DATE '2026-11-14', 65)
) AS v(d, a)
WHERE s.id = 'clarvex-demo-store'
ON CONFLICT ("campaignId", "storeId", "date") DO NOTHING;
