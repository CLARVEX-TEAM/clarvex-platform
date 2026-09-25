-- Métrica de uso: qué pantalla abre cada quien.
--
-- Aditiva: crea una tabla nueva y no toca ninguna existente. Ver el comentario
-- del modelo `ScreenView` en schema.prisma para por qué existe.
CREATE TABLE "ScreenView" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreenView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScreenView_route_createdAt_idx" ON "ScreenView"("route", "createdAt");
CREATE INDEX "ScreenView_storeId_createdAt_idx" ON "ScreenView"("storeId", "createdAt");
CREATE INDEX "ScreenView_userId_createdAt_idx" ON "ScreenView"("userId", "createdAt");

ALTER TABLE "ScreenView" ADD CONSTRAINT "ScreenView_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScreenView" ADD CONSTRAINT "ScreenView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
