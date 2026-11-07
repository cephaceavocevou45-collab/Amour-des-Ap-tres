ALTER TABLE "MeetingRequest"
ADD COLUMN "conversationId" TEXT;

CREATE UNIQUE INDEX "MeetingRequest_conversationId_key"
ON "MeetingRequest"("conversationId");

ALTER TABLE "MeetingRequest"
ADD CONSTRAINT "MeetingRequest_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
