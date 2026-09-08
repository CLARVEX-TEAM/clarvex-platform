-- Borrador de comunicado sacado del correo de promociones del corporativo.
--
-- ⚠️ Tabla APARTE de "Announcement" a proposito: si viviera alli con una
-- bandera, cualquier consulta que olvidara el filtro publicaria una promocion
-- sin revisar a toda la tienda. Quien lee comunicados no ve esta tabla.
CREATE TABLE "PromoDraft" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromoDraft_storeId_usedAt_idx" ON "PromoDraft"("storeId", "usedAt");

ALTER TABLE "PromoDraft" ADD CONSTRAINT "PromoDraft_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
