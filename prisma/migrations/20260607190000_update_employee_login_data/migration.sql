DELETE FROM "EmployeeNumberAlias"
WHERE "employeeNumber" IN ('95739', '96383');

UPDATE "User"
SET "name" = 'ITZEL SAIDY REYES BAUTISTA',
    "employeeNumber" = '81893',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'itzel';

UPDATE "User"
SET "name" = 'JESUS ADRIAN HERNANDEZ LUNA',
    "employeeNumber" = '102259',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'adrian';

UPDATE "User"
SET "name" = 'WAIRA ZITLALI POPOCA',
    "employeeNumber" = '95739',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'waira';

UPDATE "User"
SET "name" = 'JAZMIN CASTRO ZUÑIGA',
    "employeeNumber" = '96383',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'jazmin';

UPDATE "User"
SET "name" = 'ALONSO TREVIÑO',
    "employeeNumber" = '113642',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'alonso';
