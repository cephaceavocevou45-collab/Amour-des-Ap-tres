CREATE TYPE "SocialEventRsvpStatus" AS ENUM ('PARTICIPATING', 'INTERESTED', 'DECLINED');

CREATE TABLE "SocialEvent" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "location" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialEvent_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialEvent_title_check" CHECK (char_length("title") BETWEEN 1 AND 160),
    CONSTRAINT "SocialEvent_location_check" CHECK ("location" IS NULL OR char_length("location") <= 200),
    CONSTRAINT "SocialEvent_end_after_start_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);

CREATE TABLE "SocialEventRsvp" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SocialEventRsvpStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialEventRsvp_pkey" PRIMARY KEY ("eventId", "userId"),
    CONSTRAINT "SocialEventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SocialEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialEventRsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SocialEvent_postId_key" ON "SocialEvent"("postId");
CREATE INDEX "SocialEvent_startsAt_idx" ON "SocialEvent"("startsAt");
CREATE INDEX "SocialEventRsvp_userId_createdAt_idx" ON "SocialEventRsvp"("userId", "createdAt");
