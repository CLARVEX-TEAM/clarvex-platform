-- «Está escribiendo…» en el chat.
--
-- Aditiva y anulable: no toca ninguna fila existente y la app funciona igual
-- antes y después de aplicarla.
ALTER TABLE "ChatMember" ADD COLUMN "typingAt" TIMESTAMP(3);
