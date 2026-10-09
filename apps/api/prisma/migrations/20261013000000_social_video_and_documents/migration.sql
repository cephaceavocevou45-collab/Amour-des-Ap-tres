ALTER TABLE "SocialPostMedia" DROP CONSTRAINT "SocialPostMedia_mimeType_check";
ALTER TABLE "SocialPostMedia" DROP CONSTRAINT "SocialPostMedia_dimensions_check";
ALTER TABLE "SocialPostMedia"
  ADD CONSTRAINT "SocialPostMedia_mimeType_check"
    CHECK ("mimeType" IN ('image/webp', 'video/mp4', 'video/webm', 'application/pdf')),
  ADD CONSTRAINT "SocialPostMedia_dimensions_check"
    CHECK (
      "byteSize" > 0 AND "byteSize" <= 10485760 AND
      (("mimeType" = 'image/webp' AND "width" > 0 AND "width" <= 2400 AND "height" > 0 AND "height" <= 2400) OR
       ("mimeType" IN ('video/mp4', 'video/webm', 'application/pdf') AND "width" = 0 AND "height" = 0))
    );
