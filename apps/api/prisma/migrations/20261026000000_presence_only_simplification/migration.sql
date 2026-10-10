-- Retire community and public-registration storage while preserving accounts,
-- Monday programme data, attendance sheets/entries, sessions, 2FA and audit.
-- Legacy community-role accounts are disabled and their sessions revoked before
-- their enum values are removed. The migration intentionally removes community
-- content tables; archive a database backup before applying it to any valued DB.

UPDATE "User"
SET "active" = FALSE,
    "permissions" = ARRAY[]::TEXT[],
    "sessionVersion" = "sessionVersion" + 1
WHERE "role"::text IN ('FIDELE', 'MODERATEUR', 'PENDING');

UPDATE "User" AS account
SET "permissions" = ARRAY(
  SELECT permission FROM unnest(account."permissions") AS permissions(permission)
  WHERE permission NOT IN ('PUBLIER_PROGRAMME', 'GERER_ETUDES', 'PUBLIER_HISTOIRE', 'LANCER_LIVE', 'CREER_GROUPE')
);
UPDATE "RefreshToken"
SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP)
WHERE "userId" IN (
  SELECT "id" FROM "User" WHERE "role"::text IN ('FIDELE', 'MODERATEUR', 'PENDING')
);

INSERT INTO "AuditLog" ("id", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT 'community-role-retired-' || "id" || '-' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint::text,
       'ROLE_COMMUNAUTE_RETIRE', 'UserAccess', "id",
       jsonb_build_object('role', "role"::text, 'active', TRUE),
       jsonb_build_object('role', 'SECRETAIRE_PRESENCE', 'active', FALSE),
       CURRENT_TIMESTAMP
FROM "User"
WHERE "role"::text IN ('FIDELE', 'MODERATEUR', 'PENDING');

DROP TABLE IF EXISTS
  "CommunityLiveSignal", "CommunityLiveParticipant", "CommunityLive",
  "CommunityStoryReport", "CommunityStory",
  "CommunityMessageReport", "CommunityMessageReaction", "CommunityMessage",
  "GroupJoinRequest", "CommunityConversationMember", "CommunityConversation",
  "SocialGroupComment", "SocialGroupPost", "SocialGroupMembership", "SocialGroup",
  "SocialPostMedia", "SocialModerationEvent", "SocialSanction", "SocialReport",
  "SocialModerationCase", "SocialComment", "SocialReaction", "SocialPollVote",
  "SocialPollOption", "SocialPoll", "SocialEventRsvp", "SocialEvent",
  "SocialHiddenPost", "SocialSavedPost", "SocialShare", "SocialBlock", "SocialPost",
  "EmailVerificationToken", "EmailOutbox", "UserNotification",
  "ParishContent", "BibleStudyTheme", "ParishHistoryEntry", "Announcement"
CASCADE;

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "requestedRole",
  DROP COLUMN IF EXISTS "requestedWeekStart",
  DROP COLUMN IF EXISTS "assignedWeekStart",
  DROP COLUMN IF EXISTS "requestedDayOfWeek",
  DROP COLUMN IF EXISTS "dateOfBirth",
  DROP COLUMN IF EXISTS "emailVerifiedAt",
  DROP COLUMN IF EXISTS "charterVersion",
  DROP COLUMN IF EXISTS "charterAcceptedAt",
  DROP COLUMN IF EXISTS "suspendedAt",
  DROP COLUMN IF EXISTS "suspensionReason",
  DROP COLUMN IF EXISTS "suspendedUntil",
  DROP COLUMN IF EXISTS "socialNotificationsEnabled",
  DROP COLUMN IF EXISTS "socialBio",
  DROP COLUMN IF EXISTS "moderationProfileHidden",
  DROP COLUMN IF EXISTS "moderationProfileHiddenUntil",
  DROP COLUMN IF EXISTS "socialProfileDiscoverable",
  DROP COLUMN IF EXISTS "deletionScheduledAt",
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "PasswordResetToken"
  ADD COLUMN IF NOT EXISTS "failedAttempts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT USING "role"::text;
ALTER TYPE "UserRole" RENAME TO "UserRole_before_presence_only";
CREATE TYPE "UserRole" AS ENUM (
  'SUPER_ADMIN', 'ADMIN', 'EDITEUR', 'SECRETAIRE_PRESENCE', 'RESPONSABLE_SEMAINE'
);
UPDATE "User" SET "role" = 'SECRETAIRE_PRESENCE'
WHERE "role" IN ('FIDELE', 'MODERATEUR', 'PENDING');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING "role"::"UserRole";
DROP TYPE "UserRole_before_presence_only";

DROP TYPE IF EXISTS "CommunityConversationType" CASCADE;
DROP TYPE IF EXISTS "GroupJoinStatus" CASCADE;
DROP TYPE IF EXISTS "GroupMemberRole" CASCADE;
DROP TYPE IF EXISTS "GroupVisibility" CASCADE;
DROP TYPE IF EXISTS "ParishContentKind" CASCADE;
DROP TYPE IF EXISTS "SocialAppealStatus" CASCADE;
DROP TYPE IF EXISTS "SocialEventRsvpStatus" CASCADE;
DROP TYPE IF EXISTS "SocialGroupMemberRole" CASCADE;
DROP TYPE IF EXISTS "SocialGroupMemberStatus" CASCADE;
DROP TYPE IF EXISTS "SocialGroupVisibility" CASCADE;
DROP TYPE IF EXISTS "SocialModerationPriority" CASCADE;
DROP TYPE IF EXISTS "SocialModerationStatus" CASCADE;
DROP TYPE IF EXISTS "SocialReactionType" CASCADE;
DROP TYPE IF EXISTS "SocialReportReason" CASCADE;
DROP TYPE IF EXISTS "SocialReportTarget" CASCADE;
DROP TYPE IF EXISTS "SocialVisibility" CASCADE;
