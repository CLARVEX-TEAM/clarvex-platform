-- Ubicación de la tienda: dirección, coordenadas y el mapa ya armado.
--
-- Aditiva: cuatro columnas NULLABLE en una tabla existente. Ninguna tienda
-- necesita rellenarlas, y sin ellas todo se comporta exactamente como antes
-- --la tarjeta simplemente no enseña mapa--.
--
-- ⚠️ `mapaUrl` guarda la IMAGEN YA ARMADA, no se deduce de las coordenadas al
-- pintar. La ubicación de una tienda no cambia nunca, así que el mapa es un
-- archivo y no un servicio: se genera una vez desde los mosaicos de
-- OpenStreetMap, se sube a R2 y se sirve como cualquier otra imagen. Pedirlo en
-- vivo dejaría un hueco gris los días que se cae la señal del centro comercial,
-- que son todos, y haría una petición a OSM por cada apertura de pantalla.
ALTER TABLE "Store" ADD COLUMN "address" TEXT;
ALTER TABLE "Store" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Store" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Store" ADD COLUMN "mapaUrl" TEXT;
