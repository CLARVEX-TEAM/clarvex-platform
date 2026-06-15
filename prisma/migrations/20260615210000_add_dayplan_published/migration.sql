-- Estado de publicación del plan del día: null = borrador (solo gerencia lo ve).
ALTER TABLE "DayPlan" ADD COLUMN "publishedAt" TIMESTAMP(3);

-- Los planes existentes quedan publicados para no ocultarlos a los asesores.
UPDATE "DayPlan" SET "publishedAt" = "createdAt" WHERE "publishedAt" IS NULL;
