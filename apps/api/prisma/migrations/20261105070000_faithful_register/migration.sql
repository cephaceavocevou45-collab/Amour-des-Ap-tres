CREATE TABLE "FaithfulRegisterEntry" (
  "number" SERIAL NOT NULL,
  "fullName" VARCHAR(240) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "FaithfulRegisterEntry_pkey" PRIMARY KEY ("number")
);

CREATE INDEX "FaithfulRegisterEntry_createdAt_idx" ON "FaithfulRegisterEntry"("createdAt");

ALTER TABLE "FaithfulRegisterEntry"
ADD CONSTRAINT "FaithfulRegisterEntry_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
