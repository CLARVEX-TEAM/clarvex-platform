-- Saldos de vacaciones y pago de días por colaborador (en días).
ALTER TABLE "User" ADD COLUMN "vacationDays" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "paidDays" DOUBLE PRECISION NOT NULL DEFAULT 0;
