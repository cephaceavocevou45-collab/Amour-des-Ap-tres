CREATE TYPE "ParishContentKind" AS ENUM ('PROGRAMME', 'EVENEMENT');

CREATE TABLE "ParishContent" (
    "id" TEXT NOT NULL,
    "kind" "ParishContentKind" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(5000) NOT NULL,
    "location" VARCHAR(240),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "authorId" TEXT NOT NULL,
    "editorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ParishContent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ParishContent_kind_publishedAt_startsAt_idx" ON "ParishContent"("kind", "publishedAt", "startsAt");
CREATE INDEX "ParishContent_authorId_updatedAt_idx" ON "ParishContent"("authorId", "updatedAt");
ALTER TABLE "ParishContent" ADD CONSTRAINT "ParishContent_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParishContent" ADD CONSTRAINT "ParishContent_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BibleStudyTheme" (
    "id" TEXT NOT NULL,
    "studyDate" DATE NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "bibleReference" VARCHAR(240),
    "summary" VARCHAR(5000),
    "publishedAt" TIMESTAMP(3),
    "editorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BibleStudyTheme_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BibleStudyTheme_studyDate_key" ON "BibleStudyTheme"("studyDate");
CREATE INDEX "BibleStudyTheme_publishedAt_studyDate_idx" ON "BibleStudyTheme"("publishedAt", "studyDate");
ALTER TABLE "BibleStudyTheme" ADD CONSTRAINT "BibleStudyTheme_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ParishHistoryEntry" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(10000) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ParishHistoryEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ParishHistoryEntry_publishedAt_createdAt_idx" ON "ParishHistoryEntry"("publishedAt", "createdAt");
ALTER TABLE "ParishHistoryEntry" ADD CONSTRAINT "ParishHistoryEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
