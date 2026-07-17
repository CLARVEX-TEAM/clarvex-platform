-- Fotos de los ítems de escaneo del checklist de cierre (varias por documento).
CREATE TABLE IF NOT EXISTS "ChecklistScan" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChecklistScan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChecklistScan_storeId_date_itemKey_idx" ON "ChecklistScan"("storeId", "date", "itemKey");

ALTER TABLE "ChecklistScan" ADD CONSTRAINT "ChecklistScan_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
