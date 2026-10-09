-- Retire l’ancien fil, les anciens groupes de publications, sondages,
-- événements et leur modération. Les blocages de compte sont conservés pour
-- appliquer les mêmes règles aux nouvelles conversations privées.
DROP TABLE IF EXISTS "SocialSanction" CASCADE;
DROP TABLE IF EXISTS "SocialModerationEvent" CASCADE;
DROP TABLE IF EXISTS "SocialReport" CASCADE;
DROP TABLE IF EXISTS "SocialModerationCase" CASCADE;
DROP TABLE IF EXISTS "SocialGroupComment" CASCADE;
DROP TABLE IF EXISTS "SocialGroupPost" CASCADE;
DROP TABLE IF EXISTS "SocialGroupMembership" CASCADE;
DROP TABLE IF EXISTS "SocialGroup" CASCADE;
DROP TABLE IF EXISTS "SocialSavedPost" CASCADE;
DROP TABLE IF EXISTS "SocialHiddenPost" CASCADE;
DROP TABLE IF EXISTS "SocialShare" CASCADE;
DROP TABLE IF EXISTS "SocialReaction" CASCADE;
DROP TABLE IF EXISTS "SocialEventRsvp" CASCADE;
DROP TABLE IF EXISTS "SocialEvent" CASCADE;
DROP TABLE IF EXISTS "SocialPollVote" CASCADE;
DROP TABLE IF EXISTS "SocialPollOption" CASCADE;
DROP TABLE IF EXISTS "SocialPoll" CASCADE;
DROP TABLE IF EXISTS "SocialComment" CASCADE;
DROP TABLE IF EXISTS "SocialPostMedia" CASCADE;
DROP TABLE IF EXISTS "SocialPost" CASCADE;

DROP TYPE IF EXISTS "SocialVisibility" CASCADE;
DROP TYPE IF EXISTS "SocialGroupVisibility" CASCADE;
DROP TYPE IF EXISTS "SocialGroupMemberStatus" CASCADE;
DROP TYPE IF EXISTS "SocialGroupMemberRole" CASCADE;
DROP TYPE IF EXISTS "SocialReactionType" CASCADE;
DROP TYPE IF EXISTS "SocialEventRsvpStatus" CASCADE;
DROP TYPE IF EXISTS "SocialReportTarget" CASCADE;
DROP TYPE IF EXISTS "SocialReportReason" CASCADE;
DROP TYPE IF EXISTS "SocialModerationStatus" CASCADE;
DROP TYPE IF EXISTS "SocialModerationPriority" CASCADE;
DROP TYPE IF EXISTS "SocialAppealStatus" CASCADE;
