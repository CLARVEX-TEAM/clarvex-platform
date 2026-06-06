CREATE TYPE "DataSourceFrequency" AS ENUM ('MANUAL', 'HOURLY', 'DAILY', 'WEEKLY');
ALTER TABLE "DataSource" ADD COLUMN "frequency" "DataSourceFrequency" NOT NULL DEFAULT 'MANUAL';
