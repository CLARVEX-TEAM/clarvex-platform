-- Make passwordHash nullable: password-based login was removed in the security sprint.
-- PIN-based login (pinHash) is now the only active authentication method.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
UPDATE "User" SET "passwordHash" = NULL;
