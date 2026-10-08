ALTER TABLE "User" ADD COLUMN "socialProfileDiscoverable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ADD COLUMN "deletionScheduledAt" TIMESTAMP(3);
ALTER TABLE "RefreshToken" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "RefreshToken" ADD COLUMN "ip" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "userAgent" TEXT;
CREATE INDEX "User_deletionScheduledAt_idx" ON "User"("deletionScheduledAt");
CREATE INDEX "RefreshToken_userId_createdAt_idx" ON "RefreshToken"("userId", "createdAt");
