ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SECRETAIRE_PROGRAMME';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'TRESORIER';

CREATE TYPE "WeekProgramStatus" AS ENUM ('BROUILLON', 'PUBLIE', 'ARCHIVE');
CREATE TYPE "TreasuryKind" AS ENUM ('RECETTE', 'DEPENSE');

CREATE TABLE "WeekProgram" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "theme" VARCHAR(300),
    "status" "WeekProgramStatus" NOT NULL DEFAULT 'BROUILLON',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "authorId" TEXT NOT NULL,
    CONSTRAINT "WeekProgram_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WeekProgram_status_weekStart_idx" ON "WeekProgram"("status", "weekStart");
CREATE INDEX "WeekProgram_authorId_createdAt_idx" ON "WeekProgram"("authorId", "createdAt");
ALTER TABLE "WeekProgram" ADD CONSTRAINT "WeekProgram_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WeekProgramEntry" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "category" VARCHAR(80) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "people" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "details" VARCHAR(3000),
    "imageUrl" VARCHAR(1000),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WeekProgramEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WeekProgramEntry_programId_date_displayOrder_idx" ON "WeekProgramEntry"("programId", "date", "displayOrder");
ALTER TABLE "WeekProgramEntry" ADD CONSTRAINT "WeekProgramEntry_programId_fkey" FOREIGN KEY ("programId") REFERENCES "WeekProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TreasuryEntry" (
    "id" TEXT NOT NULL,
    "kind" "TreasuryKind" NOT NULL,
    "amountXof" INTEGER NOT NULL,
    "occurredAt" DATE NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "reference" VARCHAR(160),
    "receiptUrl" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    CONSTRAINT "TreasuryEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TreasuryEntry_occurredAt_kind_idx" ON "TreasuryEntry"("occurredAt", "kind");
CREATE INDEX "TreasuryEntry_authorId_createdAt_idx" ON "TreasuryEntry"("authorId", "createdAt");
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
