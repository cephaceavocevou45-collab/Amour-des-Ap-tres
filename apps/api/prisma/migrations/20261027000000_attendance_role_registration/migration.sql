-- Bring the database objects in line with the current Prisma schema.
-- The test database differs only by an obsolete refresh-token index and a
-- database default on an @updatedAt column, which Prisma manages itself.
DROP INDEX IF EXISTS "RefreshToken_userId_createdAt_idx";

ALTER TABLE "EmailDailyUsage"
  ALTER COLUMN "updatedAt" DROP DEFAULT;
