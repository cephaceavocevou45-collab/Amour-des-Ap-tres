CREATE TYPE "CommunityConversationType" AS ENUM ('DIRECT', 'GROUP');

CREATE TABLE "CommunityConversation" (
  "id" TEXT NOT NULL,
  "type" "CommunityConversationType" NOT NULL,
  "title" VARCHAR(100),
  "directKey" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "CommunityConversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommunityConversation_directKey_key" ON "CommunityConversation"("directKey");
CREATE INDEX "CommunityConversation_updatedAt_id_idx" ON "CommunityConversation"("updatedAt", "id");

CREATE TABLE "CommunityConversationMember" (
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  "lastReadAt" TIMESTAMP(3),
  "mutedUntil" TIMESTAMP(3),
  CONSTRAINT "CommunityConversationMember_pkey" PRIMARY KEY ("conversationId", "userId")
);
CREATE INDEX "CommunityConversationMember_userId_leftAt_lastReadAt_idx" ON "CommunityConversationMember"("userId", "leftAt", "lastReadAt");

CREATE TABLE "CommunityMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "replyToId" TEXT,
  "body" VARCHAR(5000) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "CommunityMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommunityMessage_senderId_idempotencyKey_key" ON "CommunityMessage"("senderId", "idempotencyKey");
CREATE INDEX "CommunityMessage_conversationId_createdAt_id_idx" ON "CommunityMessage"("conversationId", "createdAt", "id");
CREATE INDEX "CommunityMessage_senderId_createdAt_idx" ON "CommunityMessage"("senderId", "createdAt");

CREATE TABLE "CommunityMessageReaction" (
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" VARCHAR(16) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityMessageReaction_pkey" PRIMARY KEY ("messageId", "userId", "emoji")
);
CREATE INDEX "CommunityMessageReaction_userId_createdAt_idx" ON "CommunityMessageReaction"("userId", "createdAt");

CREATE TABLE "CommunityMessageReport" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "detail" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityMessageReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommunityMessageReport_messageId_reporterId_key" ON "CommunityMessageReport"("messageId", "reporterId");
CREATE INDEX "CommunityMessageReport_createdAt_idx" ON "CommunityMessageReport"("createdAt");

ALTER TABLE "CommunityConversationMember" ADD CONSTRAINT "CommunityConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CommunityConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityConversationMember" ADD CONSTRAINT "CommunityConversationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityMessage" ADD CONSTRAINT "CommunityMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CommunityConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityMessage" ADD CONSTRAINT "CommunityMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityMessage" ADD CONSTRAINT "CommunityMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "CommunityMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommunityMessageReaction" ADD CONSTRAINT "CommunityMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CommunityMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityMessageReaction" ADD CONSTRAINT "CommunityMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityMessageReport" ADD CONSTRAINT "CommunityMessageReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CommunityMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityMessageReport" ADD CONSTRAINT "CommunityMessageReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
