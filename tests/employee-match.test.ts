import assert from "node:assert/strict";
import test from "node:test";
import { buildUserByEmployeeNumber } from "../lib/employee-match";

test("resuelve numeros actuales y alias del Excel", () => {
  const users = [{ id: "jazmin", employeeNumber: "93383", employeeNumberAliases: [{ employeeNumber: "96383" }] }];
  const lookup = buildUserByEmployeeNumber(users);
  assert.equal(lookup.get("93383"), "jazmin");
  assert.equal(lookup.get("96383"), "jazmin");
});
