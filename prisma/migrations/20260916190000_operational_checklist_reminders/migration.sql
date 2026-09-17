-- Configuración por tienda para el Forms oficial de asistencia y el recordatorio
-- recurrente del checklist de energía. Las columnas son aditivas para que una
-- versión anterior de la app pueda seguir sirviendo durante el despliegue.
ALTER TABLE "Store"
ADD COLUMN "attendanceFormUrl" TEXT,
ADD COLUMN "energyChecklistReminderEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "NotificationType" ADD VALUE 'CHECKLIST_REMINDER';

-- La tienda real que solicitó el flujo. Las demás quedan apagadas hasta que se
-- capture su propio Forms, porque AXO entrega un enlace distinto por tienda.
UPDATE "Store"
SET
  "attendanceFormUrl" = 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=aTiyaFEi7E2UGxk_xRUd5ikpFp2SfbxLnVprSpCyE5RUME5WS0xPRlRTWlVMOFVSWFFCWkQ0VUtVOS4u',
  "energyChecklistReminderEnabled" = true
WHERE "id" = 'clarvex-demo-store';
