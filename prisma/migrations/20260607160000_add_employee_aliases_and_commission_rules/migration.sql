CREATE TABLE "EmployeeNumberAlias" (
    "id" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeNumberAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeNumberAlias_employeeNumber_key" ON "EmployeeNumberAlias"("employeeNumber");
CREATE INDEX "EmployeeNumberAlias_userId_idx" ON "EmployeeNumberAlias"("userId");
ALTER TABLE "EmployeeNumberAlias" ADD CONSTRAINT "EmployeeNumberAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "EmployeeNumberAlias" ("id", "employeeNumber", "userId")
SELECT 'alias-waira-96739', '96739', "id" FROM "User" WHERE "id" = 'waira'
ON CONFLICT ("employeeNumber") DO UPDATE SET "userId" = EXCLUDED."userId";

INSERT INTO "EmployeeNumberAlias" ("id", "employeeNumber", "userId")
SELECT 'alias-jazmin-96383', '96383', "id" FROM "User" WHERE "id" = 'jazmin'
ON CONFLICT ("employeeNumber") DO UPDATE SET "userId" = EXCLUDED."userId";

DELETE FROM "CommissionRule";

INSERT INTO "CommissionRule" ("id", "storeId", "role", "minSales", "maxSales", "minAchievement", "maxAchievement", "commissionPercent", "active", "createdAt", "updatedAt")
SELECT CONCAT('commission-', store."id", '-', LOWER(role_name), '-', tier), store."id", role_name::"Role", 0, NULL, min_value, max_value, percent_value, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Store" store
CROSS JOIN (VALUES
  ('ASESOR', 'base', 0.00, 99.99, 1.53),
  ('ASESOR', 'middle', 100.00, 114.99, 1.91),
  ('ASESOR', 'top', 115.00, NULL, 2.29),
  ('SUBGERENTE', 'base', 0.00, 99.99, 0.93),
  ('SUBGERENTE', 'middle', 100.00, 114.99, 1.16),
  ('SUBGERENTE', 'top', 115.00, NULL, 1.39),
  ('GERENTE', 'base', 0.00, 99.99, 1.25),
  ('GERENTE', 'middle', 100.00, 114.99, 1.56),
  ('GERENTE', 'top', 115.00, NULL, 1.87)
) AS rules(role_name, tier, min_value, max_value, percent_value);
