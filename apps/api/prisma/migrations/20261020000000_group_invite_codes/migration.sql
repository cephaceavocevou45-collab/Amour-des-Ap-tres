ALTER TABLE "CommunityConversation" ADD COLUMN "joinCodeHash" TEXT;

CREATE UNIQUE INDEX "CommunityConversation_joinCodeHash_key"
ON "CommunityConversation"("joinCodeHash");
