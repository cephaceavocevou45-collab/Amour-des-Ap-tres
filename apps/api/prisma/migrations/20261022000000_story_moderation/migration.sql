ALTER TABLE "CommunityStory"
    ADD COLUMN "moderationHidden" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "moderationHiddenUntil" TIMESTAMP(3);

CREATE TABLE "CommunityStoryReport" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "detail" VARCHAR(1000),
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "decisionReason" VARCHAR(1000),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityStoryReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityStoryReport_storyId_reporterId_key"
    ON "CommunityStoryReport"("storyId", "reporterId");
CREATE INDEX "CommunityStoryReport_status_createdAt_idx"
    ON "CommunityStoryReport"("status", "createdAt");

ALTER TABLE "CommunityStoryReport"
    ADD CONSTRAINT "CommunityStoryReport_storyId_fkey"
        FOREIGN KEY ("storyId") REFERENCES "CommunityStory"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "CommunityStoryReport_reporterId_fkey"
        FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "CommunityStoryReport_decidedById_fkey"
        FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
