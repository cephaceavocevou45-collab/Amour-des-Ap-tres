ALTER TABLE "User"
ADD COLUMN "sex" "Sex",
ADD COLUMN "profileSetupTokenHash" TEXT,
ADD COLUMN "profileSetupExpiresAt" TIMESTAMP(3),
ADD COLUMN "profileSetupRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "User_profileSetupTokenHash_key"
ON "User"("profileSetupTokenHash");

ALTER TABLE "FaithfulRegisterEntry"
ADD COLUMN "grade" VARCHAR(80),
ADD COLUMN "functionName" VARCHAR(120),
ADD COLUMN "sex" "Sex";
