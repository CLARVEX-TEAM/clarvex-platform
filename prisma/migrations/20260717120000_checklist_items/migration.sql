-- Puntos del checklist editables por tienda.
CREATE TABLE IF NOT EXISTS "ChecklistItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'check',
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChecklistItem_storeId_key_key" ON "ChecklistItem"("storeId", "key");
CREATE INDEX IF NOT EXISTS "ChecklistItem_storeId_idx" ON "ChecklistItem"("storeId");

ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
