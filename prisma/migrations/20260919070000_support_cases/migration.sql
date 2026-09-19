-- Casos de soporte vistos desde Clarvex.
--
-- Aditiva: no toca ninguna tabla existente. Zendesk sigue siendo el dueño del
-- caso; esto guarda A QUIEN PERTENECE, que es lo que Zendesk no puede decidir
-- por nosotros. Una etiqueta `store-xxx` en el ticket no es una frontera de
-- seguridad.
CREATE TABLE "SupportCase" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "zendeskId" INTEGER NOT NULL,
    "folio" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'nuevo',
    "firstReplyAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

-- Un caso nuestro es un ticket suyo: si el mismo ticket se registrara dos veces,
-- la persona veria su caso duplicado y la respuesta llegaria a uno solo.
CREATE UNIQUE INDEX "SupportCase_zendeskId_key" ON "SupportCase"("zendeskId");
CREATE UNIQUE INDEX "SupportCase_folio_key" ON "SupportCase"("folio");
CREATE INDEX "SupportCase_userId_createdAt_idx" ON "SupportCase"("userId", "createdAt");
CREATE INDEX "SupportCase_storeId_createdAt_idx" ON "SupportCase"("storeId", "createdAt");

ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
