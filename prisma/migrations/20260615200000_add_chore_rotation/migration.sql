-- Marca de actividad operativa generada (null = manual).
ALTER TABLE "Activity" ADD COLUMN "autoKey" TEXT;

-- Bitácora/fuente de verdad de la rotación de tareas operativas.
CREATE TABLE "ChoreAssignment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "choreKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChoreAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChoreAssignment_storeId_choreKey_idx" ON "ChoreAssignment"("storeId", "choreKey");

CREATE UNIQUE INDEX "ChoreAssignment_storeId_date_choreKey_key" ON "ChoreAssignment"("storeId", "date", "choreKey");

ALTER TABLE "ChoreAssignment" ADD CONSTRAINT "ChoreAssignment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChoreAssignment" ADD CONSTRAINT "ChoreAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
