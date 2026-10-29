import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("SQLite auth mode can import postgres.js without DATABASE_URL", () => {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", "const m = await import('./postgres.js'); if (m.pool !== null) process.exit(2)"],
    {
      cwd: serverDir,
      encoding: "utf8",
      env: { ...process.env, MAIHOC_AUTH_BACKEND: "sqlite", DATABASE_URL: "" }
    }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("PostgreSQL auth mode rejects missing DATABASE_URL", () => {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", "await import('./postgres.js')"],
    {
      cwd: serverDir,
      encoding: "utf8",
      env: { ...process.env, MAIHOC_AUTH_BACKEND: "postgres", DATABASE_URL: "" }
    }
  );
  assert.notEqual(result.status, 0);
  assert.match(String(result.stderr), /MAIHOC_AUTH_BACKEND=postgres.*DATABASE_URL/);
});
