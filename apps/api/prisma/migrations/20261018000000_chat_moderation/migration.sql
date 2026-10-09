ALTER TABLE "CommunityMessage"
  ADD COLUMN "moderationHidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "moderationHiddenUntil" TIMESTAMP(3);

ALTER TABLE "CommunityMessageReport"
  ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "decisionReason" VARCHAR(1000),
  ADD COLUMN "decidedById" TEXT,
  ADD COLUMN "decidedAt" TIMESTAMP(3);
CREATE INDEX "CommunityMessageReport_status_createdAt_idx" ON "CommunityMessageReport"("status", "createdAt");
ALTER TABLE "CommunityMessageReport" ADD CONSTRAINT "CommunityMessageReport_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
