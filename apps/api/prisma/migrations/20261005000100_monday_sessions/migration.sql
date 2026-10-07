ALTER TABLE "Session" ADD CONSTRAINT "session_date_monday_only" CHECK (EXTRACT(ISODOW FROM "date") = 1);
