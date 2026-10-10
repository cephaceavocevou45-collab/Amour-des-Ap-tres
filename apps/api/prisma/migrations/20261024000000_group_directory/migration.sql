CREATE TYPE "GroupVisibility" AS ENUM ('OPEN_REQUEST', 'PRIVATE_CODE');
CREATE TYPE "GroupMemberRole" AS ENUM ('CREATOR', 'ADMIN_GROUPE', 'MEMBER');
CREATE TYPE "GroupJoinStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REFUSED', 'CANCELLED');

ALTER TABLE "CommunityConversation"
    ADD COLUMN "visibility" "GroupVisibility" NOT NULL DEFAULT 'PRIVATE_CODE',
    ADD COLUMN "description" VARCHAR(1000),
    ADD COLUMN "rules" VARCHAR(2000);

ALTER TABLE "CommunityConversationMember"
    ADD COLUMN "groupRole" "GroupMemberRole" NOT NULL DEFAULT 'MEMBER';

UPDATE "CommunityConversationMember" AS member
SET "groupRole" = 'CREATOR'
FROM "CommunityConversation" AS conversation
WHERE conversation."id" = member."conversationId"
  AND conversation."type" = 'GROUP'
  AND conversation."createdById" = member."userId";

CREATE TABLE "GroupJoinRequest" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "note" VARCHAR(500),
    "status" "GroupJoinStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "GroupJoinRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupJoinRequest_conversationId_requesterId_key" ON "GroupJoinRequest"("conversationId", "requesterId");
CREATE INDEX "GroupJoinRequest_conversationId_status_createdAt_idx" ON "GroupJoinRequest"("conversationId", "status", "createdAt");
CREATE INDEX "GroupJoinRequest_requesterId_status_updatedAt_idx" ON "GroupJoinRequest"("requesterId", "status", "updatedAt");
ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CommunityConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
