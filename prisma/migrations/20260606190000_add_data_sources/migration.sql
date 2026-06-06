CREATE TYPE "DataSourceType" AS ENUM ('HORARIOS', 'KPIS', 'METAS', 'COMISIONES', 'COMUNICADOS');
CREATE TYPE "DataSourceProvider" AS ENUM ('MANUAL', 'EXCEL', 'SHAREPOINT');
CREATE TYPE "DataSourceStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');
CREATE TYPE "SyncLogStatus" AS ENUM ('SUCCESS', 'ERROR', 'RUNNING');

CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "DataSourceType" NOT NULL,
    "provider" "DataSourceProvider" NOT NULL DEFAULT 'MANUAL',
    "name" TEXT NOT NULL,
    "url" TEXT,
    "status" "DataSourceStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "lastSyncAt" TIMESTAMP(3),
    "nextSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "status" "SyncLogStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DataSource_storeId_type_key" ON "DataSource"("storeId", "type");
CREATE INDEX "DataSource_storeId_status_idx" ON "DataSource"("storeId", "status");
CREATE INDEX "SyncLog_dataSourceId_createdAt_idx" ON "SyncLog"("dataSourceId", "createdAt");

ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
