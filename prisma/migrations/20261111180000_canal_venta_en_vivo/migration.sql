-- Aditiva: qué aparatos ya crearon el canal silencioso de la venta en vivo.
ALTER TABLE "DeviceToken" ADD COLUMN "canalVentaEnVivo" BOOLEAN NOT NULL DEFAULT false;
