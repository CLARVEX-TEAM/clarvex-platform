-- Que version de la app corre cada aparato.
--
-- Las dos son opcionales a proposito: los aparatos YA registrados no la tienen
-- y no se puede inventar. Se rellenan solas la primera vez que cada telefono
-- vuelve a registrarse, que ocurre en cada arranque de la app.
ALTER TABLE "DeviceToken" ADD COLUMN "appBuild" INTEGER;
ALTER TABLE "DeviceToken" ADD COLUMN "appVersion" TEXT;
