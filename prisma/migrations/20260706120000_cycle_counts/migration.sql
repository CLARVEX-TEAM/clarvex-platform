CREATE TYPE "CycleCountZone" AS ENUM ('PISO', 'BODEGA');

CREATE TABLE "CycleCountTag" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "zone" "CycleCountZone" NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CycleCountTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CycleCountTag_storeId_number_key" ON "CycleCountTag"("storeId", "number");
CREATE INDEX "CycleCountTag_storeId_zone_idx" ON "CycleCountTag"("storeId", "zone");
ALTER TABLE "CycleCountTag" ADD CONSTRAINT "CycleCountTag_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CycleCount" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "theoretical" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "CycleCount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CycleCount_storeId_date_idx" ON "CycleCount"("storeId", "date");
ALTER TABLE "CycleCount" ADD CONSTRAINT "CycleCount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CycleCountEntry" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "count1" INTEGER,
    "count1ById" TEXT,
    "count1ByName" TEXT,
    "count1At" TIMESTAMP(3),
    "count2" INTEGER,
    "count2ById" TEXT,
    "count2ByName" TEXT,
    "count2At" TIMESTAMP(3),
    "count3" INTEGER,
    "count3ById" TEXT,
    "count3ByName" TEXT,
    "count3At" TIMESTAMP(3),
    CONSTRAINT "CycleCountEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CycleCountEntry_countId_tagId_key" ON "CycleCountEntry"("countId", "tagId");
CREATE INDEX "CycleCountEntry_countId_idx" ON "CycleCountEntry"("countId");
ALTER TABLE "CycleCountEntry" ADD CONSTRAINT "CycleCountEntry_countId_fkey" FOREIGN KEY ("countId") REFERENCES "CycleCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CycleCountEntry" ADD CONSTRAINT "CycleCountEntry_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CycleCountTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CycleCountNoUpc" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "pieces" INTEGER NOT NULL,
    CONSTRAINT "CycleCountNoUpc_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CycleCountNoUpc_countId_idx" ON "CycleCountNoUpc"("countId");
ALTER TABLE "CycleCountNoUpc" ADD CONSTRAINT "CycleCountNoUpc_countId_fkey" FOREIGN KEY ("countId") REFERENCES "CycleCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
