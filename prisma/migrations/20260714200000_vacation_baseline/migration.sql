-- Fecha de corte del saldo de vacaciones capturado a mano.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "vacationBaselineAt" TIMESTAMP(3);

-- Los saldos que hay HOY ya descuentan las vacaciones tomadas hasta hoy: gerencia
-- los venía bajando a mano. Se marca el corte en este momento para que la app
-- solo cuente de aquí en adelante. Sin esto, la primera lectura restaría otra vez
-- todas las vacaciones que ya están en Horarios.
UPDATE "User" SET "vacationBaselineAt" = NOW() WHERE "vacationBaselineAt" IS NULL;
