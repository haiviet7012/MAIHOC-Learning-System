import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAccountRole, isStaffRole } from "../account-roles.js";

test("legacy level-one admins become teachers", () => assert.equal(normalizeAccountRole("admin", 1), "teacher"));
test("top-level admins remain admins; legacy users become students", () => {
  assert.equal(normalizeAccountRole("admin", 2), "admin");
  assert.equal(normalizeAccountRole("admin", 0), "student");
  assert.equal(normalizeAccountRole("user", 0), "student");
});
test("explicit roles remain in the three-role model", () => {
  assert.equal(normalizeAccountRole("teacher"), "teacher");
  assert.equal(normalizeAccountRole("student"), "student");
});
test("only admins and teachers are staff", () => {
  assert.equal(isStaffRole("admin"), true);
  assert.equal(isStaffRole("teacher"), true);
  assert.equal(isStaffRole("student"), false);
});
