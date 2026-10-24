CREATE TABLE "Announcement" (
  "id" TEXT NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" TEXT NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "authorId" TEXT NOT NULL,
  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Announcement_published_createdAt_idx" ON "Announcement"("published", "createdAt");
