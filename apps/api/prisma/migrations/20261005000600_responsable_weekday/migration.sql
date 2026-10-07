ALTER TABLE "User" ADD COLUMN "requestedDayOfWeek" INTEGER;
ALTER TABLE "User" ADD COLUMN "assignedDayOfWeek" INTEGER;

UPDATE "User"
SET "requestedDayOfWeek" = CASE EXTRACT(DOW FROM "requestedWeekStart")::INTEGER
  WHEN 0 THEN 7 ELSE EXTRACT(DOW FROM "requestedWeekStart")::INTEGER
END
WHERE "requestedWeekStart" IS NOT NULL;

UPDATE "User"
SET "assignedDayOfWeek" = CASE EXTRACT(DOW FROM "assignedWeekStart")::INTEGER
  WHEN 0 THEN 7 ELSE EXTRACT(DOW FROM "assignedWeekStart")::INTEGER
END
WHERE "assignedWeekStart" IS NOT NULL;
