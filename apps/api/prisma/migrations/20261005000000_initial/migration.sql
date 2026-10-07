-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'EDITEUR', 'SECRETAIRE_PRESENCE', 'RESPONSABLE_SALLE_VISION');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PLANIFIEE', 'EN_COURS', 'TERMINEE');

-- CreateEnum
CREATE TYPE "SheetType" AS ENUM ('COURS_BIBLIQUE', 'GROUPE_SEMAINE');

-- CreateEnum
CREATE TYPE "SheetStatus" AS ENUM ('OUVERTE', 'ENREGISTREE');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('M', 'F');

-- CreateEnum
CREATE TYPE "Zone" AS ENUM ('FIDELES', 'TEMPLE', 'SALLE_VISION');

-- CreateEnum
CREATE TYPE "PersonRoleName" AS ENUM ('LEADER', 'MONITEUR_TABLE', 'RESUME_PRECEDENT', 'EXPLICATION_TEXTE', 'PRESENTATION_THEME');

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "grade" TEXT,
    "photoUrl" TEXT,
    "bio" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonRole" (
    "personId" TEXT NOT NULL,
    "role" "PersonRoleName" NOT NULL,

    CONSTRAINT "PersonRole_pkey" PRIMARY KEY ("personId","role")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '19:30',
    "endTime" TEXT NOT NULL DEFAULT '21:30',
    "theme" TEXT NOT NULL,
    "bibleBook" TEXT NOT NULL,
    "bibleChapter" INTEGER NOT NULL,
    "verseStart" INTEGER,
    "verseEnd" INTEGER,
    "bibleText" TEXT,
    "bibleDevelopment" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'PLANIFIEE',

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionAssignment" (
    "sessionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "PersonRoleName" NOT NULL,

    CONSTRAINT "SessionAssignment_pkey" PRIMARY KEY ("sessionId","personId","role")
);

-- CreateTable
CREATE TABLE "AttendanceSheet" (
    "id" TEXT NOT NULL,
    "type" "SheetType" NOT NULL,
    "date" DATE NOT NULL,
    "sessionId" TEXT,
    "status" "SheetStatus" NOT NULL DEFAULT 'OUVERTE',
    "totalsByZone" JSONB,
    "totalMen" INTEGER NOT NULL DEFAULT 0,
    "totalWomen" INTEGER NOT NULL DEFAULT 0,
    "totalAll" INTEGER NOT NULL DEFAULT 0,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "AttendanceSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceEntry" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "fullName" TEXT,
    "normalizedName" TEXT,
    "sex" "Sex" NOT NULL,
    "zone" "Zone" NOT NULL,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "AttendanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "totpSecret" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hashedToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "family" TEXT NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_date_key" ON "Session"("date");

-- CreateIndex
CREATE INDEX "AttendanceSheet_date_idx" ON "AttendanceSheet"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSheet_type_date_key" ON "AttendanceSheet"("type", "date");

-- CreateIndex
CREATE INDEX "AttendanceEntry_sheetId_zone_idx" ON "AttendanceEntry"("sheetId", "zone");

-- CreateIndex
CREATE INDEX "AttendanceEntry_sheetId_normalizedName_idx" ON "AttendanceEntry"("sheetId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceEntry_sheetId_clientUuid_key" ON "AttendanceEntry"("sheetId", "clientUuid");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_hashedToken_key" ON "RefreshToken"("hashedToken");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "PersonRole" ADD CONSTRAINT "PersonRole_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAssignment" ADD CONSTRAINT "SessionAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAssignment" ADD CONSTRAINT "SessionAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSheet" ADD CONSTRAINT "AttendanceSheet_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEntry" ADD CONSTRAINT "AttendanceEntry_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "AttendanceSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

