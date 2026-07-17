-- Usuario "kiosko" del celular de la tienda: solo ve el checklist.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "checklistOnly" BOOLEAN NOT NULL DEFAULT false;
