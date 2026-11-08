-- Una matriz de cursos con TODOS sus cursos completados se cierra sola desde
-- este cambio. Las que ya estaban completas antes (6 de 6 y «en proceso") se
-- ponen al día aquí, una sola vez.
UPDATE "Pending" p
SET "status" = 'COMPLETADO', "cierreSolicitadoAt" = NULL
WHERE p."tipo" = 'CURSO'
  AND p."status" <> 'COMPLETADO'
  AND EXISTS (SELECT 1 FROM "PendingCurso" c WHERE c."pendingId" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "PendingCurso" c WHERE c."pendingId" = p."id" AND c."completadoAt" IS NULL);
