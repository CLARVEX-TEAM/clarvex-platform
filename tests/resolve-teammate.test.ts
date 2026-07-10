import assert from "node:assert/strict";
import test from "node:test";
import { matchTeammatesByQuery, normalizePersonQuery } from "../lib/ai/tools/person-query";

test("normalizePersonQuery quita acentos y mayúsculas", () => {
  assert.equal(normalizePersonQuery("  ALONSO TREVIÑO  "), "alonso trevino");
  assert.equal(normalizePersonQuery("Jazmín"), "jazmin");
});

test("matchTeammatesByQuery resuelve por nombre parcial y por número", () => {
  const people = [
    { id: "1", name: "WAIRA ZITLALI POPOCA", employeeNumber: "100" },
    { id: "2", name: "ALONSO TREVIÑO", employeeNumber: "113642" },
    { id: "3", name: "JAZMIN CASTRO ZUÑIGA", employeeNumber: "200" }
  ];

  assert.equal(matchTeammatesByQuery(people, "Alonso").length, 1);
  assert.equal(matchTeammatesByQuery(people, "Alonso")[0]?.id, "2");
  assert.equal(matchTeammatesByQuery(people, "113642")[0]?.id, "2");
  assert.equal(matchTeammatesByQuery(people, "jazmin castro")[0]?.id, "3");
  assert.equal(matchTeammatesByQuery(people, "Popoca")[0]?.id, "1");
  assert.equal(matchTeammatesByQuery(people, "nadie").length, 0);
});
