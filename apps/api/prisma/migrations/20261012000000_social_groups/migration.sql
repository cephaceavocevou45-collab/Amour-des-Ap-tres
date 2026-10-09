CREATE TYPE "SocialGroupVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "SocialGroupMemberStatus" AS ENUM ('MEMBER', 'PENDING');
CREATE TYPE "SocialGroupMemberRole" AS ENUM ('OWNER', 'MODERATOR', 'MEMBER');

CREATE TABLE "SocialGroup" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "visibility" "SocialGroupVisibility" NOT NULL DEFAULT 'PUBLIC',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialGroup_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SocialGroupMembership" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SocialGroupMemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "SocialGroupMemberStatus" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialGroupMembership_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialGroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SocialGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialGroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SocialGroup_visibility_createdAt_idx" ON "SocialGroup"("visibility", "createdAt");
CREATE INDEX "SocialGroup_createdById_createdAt_idx" ON "SocialGroup"("createdById", "createdAt");
CREATE UNIQUE INDEX "SocialGroupMembership_groupId_userId_key" ON "SocialGroupMembership"("groupId", "userId");
CREATE INDEX "SocialGroupMembership_userId_status_idx" ON "SocialGroupMembership"("userId", "status");
CREATE INDEX "SocialGroupMembership_groupId_status_createdAt_idx" ON "SocialGroupMembership"("groupId", "status", "createdAt");
