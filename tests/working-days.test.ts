import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkingScheduleKeys } from "../lib/working-days";

test("WORKING e INVENTORY cuentan como días laborados", () => {
  const keys = buildWorkingScheduleKeys([
    { userId: "u1", date: new Date("2026-08-23T00:00:00.000Z"), status: "WORKING", statusRaw: "LABORANDO" },
    { userId: "u1", date: new Date("2026-08-24T00:00:00.000Z"), status: "INVENTORY", statusRaw: "CONTEO" },
    { userId: "u1", date: new Date("2026-08-25T00:00:00.000Z"), status: "OFF", statusRaw: "DESCANSO" }
  ]);
  assert.deepEqual([...keys], ["u1:2026-08-23", "u1:2026-08-24"]);
});
