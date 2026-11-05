CREATE TABLE "ParishDailyAttendanceReport" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "presidentId" TEXT NOT NULL,
    "summary" VARCHAR(2000) NOT NULL,
    "difficulties" VARCHAR(2000) NOT NULL,
    "followUp" VARCHAR(2000) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParishDailyAttendanceReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParishDailyAttendanceReport_date_presidentId_key"
ON "ParishDailyAttendanceReport"("date", "presidentId");

CREATE INDEX "ParishDailyAttendanceReport_date_idx"
ON "ParishDailyAttendanceReport"("date");

ALTER TABLE "ParishDailyAttendanceReport"
ADD CONSTRAINT "ParishDailyAttendanceReport_presidentId_fkey"
FOREIGN KEY ("presidentId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
