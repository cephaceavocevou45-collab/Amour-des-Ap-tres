-- Convert legacy unapproved FIDELE accounts to an inactive, privilege-free state.
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM (
  'SUPER_ADMIN',
  'ADMIN',
  'EDITEUR',
  'SECRETAIRE_PRESENCE',
  'RESPONSABLE_SEMAINE',
  'PENDING'
);

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole"
  USING (CASE WHEN "role"::text = 'FIDELE' THEN 'PENDING' ELSE "role"::text END)::"UserRole";

ALTER TABLE "User"
  ALTER COLUMN "requestedRole" TYPE "UserRole"
  USING (CASE WHEN "requestedRole" IS NULL OR "requestedRole"::text = 'FIDELE' THEN NULL ELSE "requestedRole"::text END)::"UserRole";

UPDATE "User" SET "active" = FALSE WHERE "role" = 'PENDING';
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
UPDATE "RefreshToken" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "revokedAt" IS NULL;
DROP TYPE "UserRole_old";
