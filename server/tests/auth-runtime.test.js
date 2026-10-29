import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword, verifyPassword, publicUser } from "../auth.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("publicUser normalizes PostgreSQL BIGINT IDs to numbers", () => {
  const user = publicUser({
    id: "42",
    name: "Learner",
    email: "learner@example.test",
    role: "user",
    admin_level: "0",
    created_at: "2026-01-01 00:00:00"
  });
  assert.equal(user.id, 42);
  assert.equal(user.adminLevel, 0);
  assert.equal(user.email, "learner@example.test");
});

test("existing scrypt password hashes remain verifiable", async () => {
  const password = "correct horse battery";
  const hash = await hashPassword(password);
  assert.match(hash, /^scrypt\$/);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("incorrect password", hash), false);
});

test("PostgreSQL auth mode fails closed if DATABASE_URL is missing", () => {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", "await import('./auth.js')"],
    {
      cwd: serverDir,
      encoding: "utf8",
      env: { ...process.env, AUTH_STORAGE: "postgres", DATABASE_URL: "" }
    }
  );
  assert.notEqual(result.status, 0);
  assert.match(
    String(result.stderr),
    /AUTH_STORAGE=postgres requires DATABASE_URL/
  );
});
