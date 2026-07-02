-- Usuarios desactivados: no pueden iniciar sesión y sus sesiones existentes dejan de valer.
ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
