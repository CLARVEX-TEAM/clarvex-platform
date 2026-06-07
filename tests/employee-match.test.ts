import assert from "node:assert/strict";
import test from "node:test";
import { buildUserByEmployeeNumber } from "../lib/employee-match";

test("resuelve numeros actuales y alias del Excel", () => {
  const users = [{ id: "waira", employeeNumber: "95739", employeeNumberAliases: [{ employeeNumber: "96739" }] }];
  const lookup = buildUserByEmployeeNumber(users);
  assert.equal(lookup.get("95739"), "waira");
  assert.equal(lookup.get("96739"), "waira");
});
