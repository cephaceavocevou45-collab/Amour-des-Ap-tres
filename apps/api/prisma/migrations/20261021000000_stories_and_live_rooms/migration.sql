CREATE TABLE "CommunityStory" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommunityStory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityLive" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "CommunityLive_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityLiveParticipant" (
    "liveId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" VARCHAR(8) NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    CONSTRAINT "CommunityLiveParticipant_pkey" PRIMARY KEY ("liveId", "userId")
);

CREATE TABLE "CommunityLiveSignal" (
    "id" TEXT NOT NULL,
    "liveId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "payload" VARCHAR(20000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityLiveSignal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommunityStory_expiresAt_createdAt_idx" ON "CommunityStory"("expiresAt", "createdAt");
CREATE INDEX "CommunityStory_authorId_createdAt_idx" ON "CommunityStory"("authorId", "createdAt");
CREATE INDEX "CommunityLive_endedAt_createdAt_idx" ON "CommunityLive"("endedAt", "createdAt");
CREATE INDEX "CommunityLive_hostId_endedAt_idx" ON "CommunityLive"("hostId", "endedAt");
CREATE INDEX "CommunityLiveParticipant_userId_leftAt_idx" ON "CommunityLiveParticipant"("userId", "leftAt");
CREATE INDEX "CommunityLiveSignal_liveId_targetId_createdAt_idx" ON "CommunityLiveSignal"("liveId", "targetId", "createdAt");

ALTER TABLE "CommunityStory" ADD CONSTRAINT "CommunityStory_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityLive" ADD CONSTRAINT "CommunityLive_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityLiveParticipant" ADD CONSTRAINT "CommunityLiveParticipant_liveId_fkey" FOREIGN KEY ("liveId") REFERENCES "CommunityLive"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityLiveParticipant" ADD CONSTRAINT "CommunityLiveParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityLiveSignal" ADD CONSTRAINT "CommunityLiveSignal_liveId_fkey" FOREIGN KEY ("liveId") REFERENCES "CommunityLive"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityLiveSignal" ADD CONSTRAINT "CommunityLiveSignal_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityLiveSignal" ADD CONSTRAINT "CommunityLiveSignal_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
