-- AlterTable: agregar columna type, hacer case opcional y migrar la restriccion unica.
-- Las filas existentes provienen del cierre de dia, por lo que se marcan como 'EVENING'.
ALTER TABLE "DailyNotificationLog" ADD COLUMN "type" TEXT;
UPDATE "DailyNotificationLog" SET "type" = 'EVENING' WHERE "type" IS NULL;
ALTER TABLE "DailyNotificationLog" ALTER COLUMN "type" SET NOT NULL;
ALTER TABLE "DailyNotificationLog" ALTER COLUMN "case" DROP NOT NULL;

-- DropIndex (restriccion unica anterior por empleado + fecha)
DROP INDEX IF EXISTS "DailyNotificationLog_employeeId_date_key";

-- CreateIndex (nueva restriccion: empleado + fecha + tipo)
CREATE UNIQUE INDEX "DailyNotificationLog_employeeId_date_type_key" ON "DailyNotificationLog"("employeeId", "date", "type");
