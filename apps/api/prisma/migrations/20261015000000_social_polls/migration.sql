CREATE TABLE "SocialPoll" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "closesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialPoll_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialPoll_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SocialPollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "text" VARCHAR(120) NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "SocialPollOption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "SocialPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialPollOption_id_pollId_key" UNIQUE ("id", "pollId"),
    CONSTRAINT "SocialPollOption_text_check" CHECK (char_length("text") BETWEEN 1 AND 120),
    CONSTRAINT "SocialPollOption_position_check" CHECK ("position" >= 0)
);

CREATE TABLE "SocialPollVote" (
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialPollVote_pkey" PRIMARY KEY ("pollId", "userId"),
    CONSTRAINT "SocialPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "SocialPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialPollVote_optionId_pollId_fkey" FOREIGN KEY ("optionId", "pollId") REFERENCES "SocialPollOption"("id", "pollId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialPollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SocialPoll_postId_key" ON "SocialPoll"("postId");
CREATE INDEX "SocialPoll_closesAt_idx" ON "SocialPoll"("closesAt");
CREATE UNIQUE INDEX "SocialPollOption_pollId_position_key" ON "SocialPollOption"("pollId", "position");
CREATE INDEX "SocialPollOption_pollId_position_idx" ON "SocialPollOption"("pollId", "position");
CREATE INDEX "SocialPollVote_optionId_pollId_idx" ON "SocialPollVote"("optionId", "pollId");
CREATE INDEX "SocialPollVote_userId_createdAt_idx" ON "SocialPollVote"("userId", "createdAt");
