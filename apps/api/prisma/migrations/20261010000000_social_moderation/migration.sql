CREATE TYPE "SocialReportTarget" AS ENUM ('POST', 'COMMENT', 'PROFILE');
CREATE TYPE "SocialReportReason" AS ENUM ('SPAM', 'HARCELEMENT', 'CONTENU_INAPPROPRIE', 'USURPATION', 'AUTRE');
CREATE TYPE "SocialModerationStatus" AS ENUM ('OPEN', 'AUTO_HIDDEN', 'REVIEWED', 'DISMISSED');
CREATE TYPE "SocialModerationPriority" AS ENUM ('NORMAL', 'ELEVEE', 'URGENTE');
CREATE TYPE "SocialAppealStatus" AS ENUM ('NONE', 'PENDING', 'ACCEPTED', 'REJECTED');

ALTER TABLE "User" ADD COLUMN "moderationProfileHidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "moderationProfileHiddenUntil" TIMESTAMP(3);
ALTER TABLE "SocialPost" ADD COLUMN "moderationHidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SocialPost" ADD COLUMN "moderationHiddenUntil" TIMESTAMP(3);
ALTER TABLE "SocialComment" ADD COLUMN "moderationHidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SocialComment" ADD COLUMN "moderationHiddenUntil" TIMESTAMP(3);

CREATE TABLE "SocialModerationCase" (
    "id" TEXT NOT NULL,
    "targetType" "SocialReportTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetAuthorId" TEXT NOT NULL,
    "status" "SocialModerationStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "SocialModerationPriority" NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "SocialModerationCase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SocialModerationCase_targetType_targetId_key" ON "SocialModerationCase"("targetType", "targetId");
CREATE INDEX "SocialModerationCase_status_priority_updatedAt_idx" ON "SocialModerationCase"("status", "priority", "updatedAt");
CREATE INDEX "SocialModerationCase_targetAuthorId_createdAt_idx" ON "SocialModerationCase"("targetAuthorId", "createdAt");

CREATE TABLE "SocialReport" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "SocialReportReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialReport_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SocialModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SocialReport_caseId_reporterId_key" ON "SocialReport"("caseId", "reporterId");
CREATE INDEX "SocialReport_createdAt_idx" ON "SocialReport"("createdAt");

CREATE TABLE "SocialModerationEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "until" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialModerationEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialModerationEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SocialModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SocialModerationEvent_caseId_createdAt_idx" ON "SocialModerationEvent"("caseId", "createdAt");

CREATE TABLE "SocialSanction" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "suspendedUntil" TIMESTAMP(3),
    "permanent" BOOLEAN NOT NULL DEFAULT false,
    "appealStatus" "SocialAppealStatus" NOT NULL DEFAULT 'NONE',
    "appealedAt" TIMESTAMP(3),
    "appealReason" TEXT,
    "appealDecidedById" TEXT,
    "appealDecisionReason" TEXT,
    "appealDecidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialSanction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialSanction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SocialModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialSanction_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialSanction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SocialSanction_appealDecidedById_fkey" FOREIGN KEY ("appealDecidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "SocialSanction_targetUserId_suspendedUntil_idx" ON "SocialSanction"("targetUserId", "suspendedUntil");
CREATE INDEX "SocialSanction_appealStatus_createdAt_idx" ON "SocialSanction"("appealStatus", "createdAt");
