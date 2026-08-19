-- Fecha de corte del saldo de pago de dias. Lo capturado a mano ya cubre lo
-- anterior; sin esta frontera se recontarian semanas viejas y el saldo saldria
-- inflado. Misma idea que vacationBaselineAt.
ALTER TABLE "User" ADD COLUMN "paidDaysBaselineAt" TIMESTAMP(3);
