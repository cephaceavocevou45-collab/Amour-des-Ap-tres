CREATE TABLE "RecoveryCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RecoveryCode_userId_usedAt_idx" ON "RecoveryCode"("userId", "usedAt");

-- Earlier attendance correction events could contain names and free-text motives.
UPDATE "AuditLog"
SET "before" = CASE WHEN "before" IS NULL THEN NULL ELSE "before" - 'fullName' - 'normalizedName' END,
    "after" = CASE WHEN "after" IS NULL THEN NULL ELSE "after" - 'fullName' - 'normalizedName' END,
    "reason" = CASE WHEN "reason" IS NULL THEN NULL ELSE 'Motif historique anonymisé' END
WHERE "entity" = 'AttendanceEntry';
