import assert from "node:assert/strict";
import test from "node:test";
import { buildUserByEmployeeNumber } from "../lib/employee-match";

test("resuelve numeros actuales y alias del Excel", () => {
  const users = [{ id: "user-1", employeeNumber: "10001", employeeNumberAliases: [{ employeeNumber: "90001" }] }];
  const lookup = buildUserByEmployeeNumber(users);
  assert.equal(lookup.get("10001"), "user-1");
  assert.equal(lookup.get("90001"), "user-1");
});
