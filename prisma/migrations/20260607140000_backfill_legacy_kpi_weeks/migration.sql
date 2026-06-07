UPDATE "Kpi"
SET
  "weekStart" = date_trunc('day', "date") - (EXTRACT(DOW FROM "date") * INTERVAL '1 day'),
  "weekEnd" = date_trunc('day', "date") - (EXTRACT(DOW FROM "date") * INTERVAL '1 day') + INTERVAL '6 days',
  "weekNumber" = EXTRACT(WEEK FROM (date_trunc('day', "date") - (EXTRACT(DOW FROM "date") * INTERVAL '1 day')))::INTEGER
WHERE "weekNumber" IS NULL
   OR "weekStart" IS NULL
   OR "weekEnd" IS NULL;
