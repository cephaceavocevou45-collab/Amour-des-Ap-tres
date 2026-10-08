CREATE TABLE "SocialPostMedia" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialPostMedia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialPostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialPostMedia_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialPostMedia_mimeType_check" CHECK ("mimeType" = 'image/webp'),
    CONSTRAINT "SocialPostMedia_dimensions_check" CHECK ("byteSize" > 0 AND "byteSize" <= 10485760 AND "width" > 0 AND "width" <= 2400 AND "height" > 0 AND "height" <= 2400)
);
CREATE UNIQUE INDEX "SocialPostMedia_objectKey_key" ON "SocialPostMedia"("objectKey");
CREATE INDEX "SocialPostMedia_postId_position_idx" ON "SocialPostMedia"("postId", "position");
