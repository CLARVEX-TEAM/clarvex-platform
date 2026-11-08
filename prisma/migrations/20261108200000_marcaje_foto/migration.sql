-- Aditiva: fotos de la pantalla de marcaje del POS mandadas por WhatsApp.
CREATE TABLE "MarcajeFoto" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "accion" TEXT NOT NULL,
    "hora" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarcajeFoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarcajeFoto_userId_date_accion_key" ON "MarcajeFoto"("userId", "date", "accion");
CREATE INDEX "MarcajeFoto_storeId_date_idx" ON "MarcajeFoto"("storeId", "date");

ALTER TABLE "MarcajeFoto" ADD CONSTRAINT "MarcajeFoto_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarcajeFoto" ADD CONSTRAINT "MarcajeFoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
