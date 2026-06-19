-- Presencia del usuario (en línea / última vez)
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

-- Mensajes: eliminado para todos (soft delete)
ALTER TABLE "ChatMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Entregas (estado "entregado" del mensaje)
CREATE TABLE "ChatMessageDelivery" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessageDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMessageDelivery_messageId_userId_key" ON "ChatMessageDelivery"("messageId", "userId");
CREATE INDEX "ChatMessageDelivery_messageId_idx" ON "ChatMessageDelivery"("messageId");
CREATE INDEX "ChatMessageDelivery_userId_idx" ON "ChatMessageDelivery"("userId");

ALTER TABLE "ChatMessageDelivery" ADD CONSTRAINT "ChatMessageDelivery_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageDelivery" ADD CONSTRAINT "ChatMessageDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ocultar para mí (eliminar solo para el propio usuario)
CREATE TABLE "ChatMessageHide" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessageHide_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMessageHide_messageId_userId_key" ON "ChatMessageHide"("messageId", "userId");
CREATE INDEX "ChatMessageHide_messageId_idx" ON "ChatMessageHide"("messageId");
CREATE INDEX "ChatMessageHide_userId_idx" ON "ChatMessageHide"("userId");

ALTER TABLE "ChatMessageHide" ADD CONSTRAINT "ChatMessageHide_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageHide" ADD CONSTRAINT "ChatMessageHide_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
