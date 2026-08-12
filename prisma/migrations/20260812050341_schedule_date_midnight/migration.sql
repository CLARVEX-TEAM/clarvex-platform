-- `Schedule.date` identifica un DÍA, no un instante. La clave única
-- @@unique([userId, date]) compara el timestamp COMPLETO, así que una fila con
-- hora distinta de medianoche no colisiona con la del mismo día: convive con
-- ella y el día queda duplicado.
--
-- Pasó de verdad. La semilla demo (`prisma/seed.ts`) se corrió una vez contra
-- producción — `clarvex-demo-store` es TH SAN AGUSTIN, la tienda real — y su
-- `const today = new Date("2026-06-05T12:00:00.000Z")` dejó cuatro horarios
-- anclados a mediodía. Sobrevivieron dos meses porque son invisibles para las
-- consultas que filtran por igualdad (`date: { in: ... }`), y eso incluye al
-- propio borrado de obsoletos del sync: nunca los evaluaba. Las consultas por
-- RANGO sí los veían, y uno de ellos (96383, 10-jun) contradecía al horario
-- bueno: mediodía decía LABORANDO donde la sincronización decía DESCANSO.
--
-- Los dos escritores actuales ya anclan a medianoche UTC —`utcDate()` en
-- `lib/schedule-parser.ts` y `normalizeScheduleEntry()` en
-- `lib/schedule-capture-entry.ts`— y la semilla ya tiene candado. Esto es la
-- red por debajo: que un tercer escritor no pueda repetirlo en silencio.
--
-- `weekStart` va incluido por ser el mismo tipo de dato y el origen real del
-- mediodía en aquel incidente (la semilla lo escribía como `weekStart: today`).
--
-- Nota: Prisma no modela CHECK en schema.prisma, pero tampoco lo diffea ni lo
-- elimina. La restricción sobrevive a los `migrate dev` posteriores.

ALTER TABLE "Schedule"
  ADD CONSTRAINT "Schedule_date_midnight_ck"
  CHECK (date_trunc('day', "date") = "date");

ALTER TABLE "Schedule"
  ADD CONSTRAINT "Schedule_weekStart_midnight_ck"
  CHECK (date_trunc('day', "weekStart") = "weekStart");
