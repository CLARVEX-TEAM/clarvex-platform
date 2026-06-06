-- Remove accidental duplicates before enforcing one KPI record per employee and date.
DELETE FROM "Kpi"
WHERE ctid IN (
  SELECT ctid
  FROM (
    SELECT ctid, ROW_NUMBER() OVER (
      PARTITION BY "userId", "date"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS duplicate_number
    FROM "Kpi"
  ) duplicates
  WHERE duplicate_number > 1
);

CREATE UNIQUE INDEX "Kpi_userId_date_key" ON "Kpi"("userId", "date");
CREATE INDEX "Kpi_storeId_date_idx" ON "Kpi"("storeId", "date");
