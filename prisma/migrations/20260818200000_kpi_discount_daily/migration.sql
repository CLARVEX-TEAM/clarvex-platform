-- Distingue el margen capturado POR DIA del total semanal en la fila ancla.
-- Sumar un total semanal mas los dias sueltos de esa misma semana inflaria el
-- descuento sin que nada avise, asi que hay que poder negarse a mezclarlos.
ALTER TABLE "Kpi" ADD COLUMN "discountDaily" BOOLEAN NOT NULL DEFAULT false;
