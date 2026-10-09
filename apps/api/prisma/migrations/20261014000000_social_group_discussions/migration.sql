CREATE TABLE "SocialGroupPost" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "SocialGroupPost_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialGroupPost_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SocialGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialGroupPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialGroupPost_body_check" CHECK (char_length("body") BETWEEN 1 AND 5000)
);

CREATE TABLE "SocialGroupComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "SocialGroupComment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialGroupComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialGroupPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialGroupComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialGroupComment_body_check" CHECK (char_length("body") BETWEEN 1 AND 2000)
);

CREATE UNIQUE INDEX "SocialGroupPost_groupId_authorId_idempotencyKey_key" ON "SocialGroupPost"("groupId", "authorId", "idempotencyKey");
CREATE INDEX "SocialGroupPost_groupId_createdAt_id_idx" ON "SocialGroupPost"("groupId", "createdAt", "id");
CREATE INDEX "SocialGroupPost_authorId_createdAt_idx" ON "SocialGroupPost"("authorId", "createdAt");
CREATE INDEX "SocialGroupComment_postId_createdAt_idx" ON "SocialGroupComment"("postId", "createdAt");
