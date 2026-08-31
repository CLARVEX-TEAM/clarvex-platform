-- Menciones, edicion y fijado en el chat.
--
-- Todo es aditivo: columnas nulables y una tabla nueva. Ningun mensaje
-- existente cambia, y la app sigue funcionando si se despliega antes.

ALTER TABLE "ChatMessage" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN "pinnedById" TEXT;

-- Una mencion `@` dentro de un mensaje.
--
-- En su propia tabla y no deducida del texto al leer: el nombre de una persona
-- puede cambiar, y entonces una mencion vieja dejaria de existir --o peor,
-- empezaria a apuntar a otra--. A quien se menciono es un hecho del momento en
-- que se escribio.
CREATE TABLE "ChatMention" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMention_messageId_userId_key" ON "ChatMention"("messageId", "userId");
CREATE INDEX "ChatMention_userId_createdAt_idx" ON "ChatMention"("userId", "createdAt");
CREATE INDEX "ChatMessage_roomId_pinnedAt_idx" ON "ChatMessage"("roomId", "pinnedAt");

ALTER TABLE "ChatMention" ADD CONSTRAINT "ChatMention_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMention" ADD CONSTRAINT "ChatMention_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
