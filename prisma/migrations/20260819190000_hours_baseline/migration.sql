-- Fecha de corte del banco de horas. Sin ella, ajustar el saldo a mano vuelve a
-- sumar todo el historico encima del ajuste. Misma idea que vacationBaselineAt.
ALTER TABLE "User" ADD COLUMN "hoursBaselineAt" TIMESTAMP(3);
