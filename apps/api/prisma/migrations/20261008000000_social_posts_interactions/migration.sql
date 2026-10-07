CREATE TYPE "SocialVisibility" AS ENUM ('TOUS_LES_FIDELES', 'MOI_SEUL');
CREATE TYPE "SocialReactionType" AS ENUM ('AIME', 'COEUR');
ALTER TABLE "User" ADD COLUMN "socialNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "SocialVisibility" NOT NULL DEFAULT 'TOUS_LES_FIDELES',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "sourcePostId" TEXT,
    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialPost_body_length" CHECK (char_length("body") <= 5000)
);
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_sourcePostId_fkey" FOREIGN KEY ("sourcePostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "SocialPost_sourcePostId_idx" ON "SocialPost"("sourcePostId");
CREATE UNIQUE INDEX "SocialPost_authorId_idempotencyKey_key" ON "SocialPost"("authorId", "idempotencyKey");
CREATE INDEX "SocialPost_visibility_createdAt_id_idx" ON "SocialPost"("visibility", "createdAt", "id");
CREATE INDEX "SocialPost_authorId_createdAt_idx" ON "SocialPost"("authorId", "createdAt");
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SocialComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "SocialComment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialComment_body_length" CHECK (char_length("body") BETWEEN 1 AND 2000)
);
CREATE INDEX "SocialComment_postId_createdAt_idx" ON "SocialComment"("postId", "createdAt");
CREATE INDEX "SocialComment_parentId_createdAt_idx" ON "SocialComment"("parentId", "createdAt");
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SocialComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SocialReaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "targetKey" TEXT NOT NULL,
    "type" "SocialReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialReaction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialReaction_single_target" CHECK (("postId" IS NOT NULL)::int + ("commentId" IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX "SocialReaction_userId_targetKey_type_key" ON "SocialReaction"("userId", "targetKey", "type");
CREATE INDEX "SocialReaction_targetKey_idx" ON "SocialReaction"("targetKey");
ALTER TABLE "SocialReaction" ADD CONSTRAINT "SocialReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialReaction" ADD CONSTRAINT "SocialReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialReaction" ADD CONSTRAINT "SocialReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "SocialComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SocialShare" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialShare_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialShare_body_length" CHECK ("body" IS NULL OR char_length("body") <= 1000)
);
CREATE UNIQUE INDEX "SocialShare_userId_postId_key" ON "SocialShare"("userId", "postId");
CREATE INDEX "SocialShare_createdAt_idx" ON "SocialShare"("createdAt");
ALTER TABLE "SocialShare" ADD CONSTRAINT "SocialShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialShare" ADD CONSTRAINT "SocialShare_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SocialSavedPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialSavedPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SocialSavedPost_userId_postId_key" ON "SocialSavedPost"("userId", "postId");
ALTER TABLE "SocialSavedPost" ADD CONSTRAINT "SocialSavedPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialSavedPost" ADD CONSTRAINT "SocialSavedPost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SocialHiddenPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialHiddenPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SocialHiddenPost_userId_postId_key" ON "SocialHiddenPost"("userId", "postId");
ALTER TABLE "SocialHiddenPost" ADD CONSTRAINT "SocialHiddenPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialHiddenPost" ADD CONSTRAINT "SocialHiddenPost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SocialBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialBlock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialBlock_no_self" CHECK ("blockerId" <> "blockedId")
);
CREATE UNIQUE INDEX "SocialBlock_blockerId_blockedId_key" ON "SocialBlock"("blockerId", "blockedId");
CREATE INDEX "SocialBlock_blockedId_idx" ON "SocialBlock"("blockedId");
ALTER TABLE "SocialBlock" ADD CONSTRAINT "SocialBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialBlock" ADD CONSTRAINT "SocialBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
