-- La «Capacitación Expertos One Axo» de TH San Agustín pasa a ser una matriz de
-- cursos: los seis del Proyecto One Axo en Crehana. Solo toca los abiertos de
-- esa tienda; en cualquier otra base no encuentra nada y no hace nada.
UPDATE "Pending"
SET "tipo" = 'CURSO'
WHERE "storeId" = 'clarvex-demo-store'
  AND "title" = 'Capacitación Expertos One Axo'
  AND "status" <> 'COMPLETADO';

INSERT INTO "PendingCurso" ("id", "pendingId", "orden", "nombre")
SELECT gen_random_uuid()::text, p."id", c.orden, c.nombre
FROM "Pending" p
CROSS JOIN (VALUES
  (1, 'Ligas de pago y donativos'),
  (2, 'POS Xstore'),
  (3, 'Omnicanalidad'),
  (4, 'POS Xstore Admin'),
  (5, 'SAP Fiori'),
  (6, 'Sistema One Axo')
) AS c(orden, nombre)
WHERE p."storeId" = 'clarvex-demo-store'
  AND p."title" = 'Capacitación Expertos One Axo'
  AND p."tipo" = 'CURSO'
ON CONFLICT ("pendingId", "orden") DO NOTHING;
