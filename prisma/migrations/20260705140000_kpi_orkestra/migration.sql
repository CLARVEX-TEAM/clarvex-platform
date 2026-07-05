-- Venta por WhatsApp (columnas ORKESTRA del RDV) por asesor y día.
ALTER TABLE "Kpi" ADD COLUMN "orkestraSales" DECIMAL(12,2);
ALTER TABLE "Kpi" ADD COLUMN "orkestraTransactions" INTEGER;
ALTER TABLE "Kpi" ADD COLUMN "orkestraPieces" INTEGER;
