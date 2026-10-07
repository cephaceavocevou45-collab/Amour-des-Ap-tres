ALTER TABLE "User"
ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Existing editors receive no implicit permissions; an administrator must grant each one.
