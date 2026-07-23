-- Usuario de demostración (tienda demo pública). Su sesión es de SOLO LECTURA.
ALTER TABLE "User" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
