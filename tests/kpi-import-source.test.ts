import assert from "node:assert/strict";
import test from "node:test";
import { shouldRdvSkipKpiUpdate } from "../lib/kpi-import-source";

test("shouldRdvSkipKpiUpdate protege KPIs de hoy importados por Power BI", () => {
  const now = new Date("2026-07-12T18:00:00.000Z");
  const today = new Date("2026-07-12T00:00:00.000Z");
  const yesterday = new Date("2026-07-11T00:00:00.000Z");

  assert.equal(
    shouldRdvSkipKpiUpdate({ importSource: "POWER_BI", date: today, now }),
    true
  );
  assert.equal(
    shouldRdvSkipKpiUpdate({ importSource: "POWER_BI", date: yesterday, now }),
    false
  );
  assert.equal(
    shouldRdvSkipKpiUpdate({ importSource: "RDV", date: today, now }),
    false
  );
});
