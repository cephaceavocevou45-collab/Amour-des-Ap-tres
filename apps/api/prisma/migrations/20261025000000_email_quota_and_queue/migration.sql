CREATE TABLE "EmailDailyUsage" (
    "day" DATE NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "alertSent" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailDailyUsage_pkey" PRIMARY KEY ("day")
);

CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "template" VARCHAR(40) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailOutbox_sentAt_nextAttemptAt_createdAt_idx"
ON "EmailOutbox"("sentAt", "nextAttemptAt", "createdAt");

ALTER TABLE "EmailOutbox"
ADD CONSTRAINT "EmailOutbox_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
