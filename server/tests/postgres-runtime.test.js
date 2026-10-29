import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresDb, translateSqlToPostgres } from "../postgres.js";

function makePool() {
  const calls = [];
  const clientCalls = [];
  const client = {
    async query(sql, values) {
      clientCalls.push({ sql, values: values ?? [] });
      if (/^INSERT INTO users/i.test(sql)) {
        return { rows: [{ id: 41 }], rowCount: 1 };
      }
      if (/^SELECT/i.test(sql)) {
        return { rows: [{ id: 41, email: "test@example.com" }], rowCount: 1 };
      }
      if (/^UPDATE/i.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() { clientCalls.push({ sql: "RELEASE_CLIENT", values: [] }); }
  };
  return {
    calls, clientCalls,
    async query(sql, values) {
      calls.push({ sql, values: values ?? [] });
      if (/^INSERT INTO users/i.test(sql)) return { rows: [{ id: 41 }], rowCount: 1 };
      if (/^SELECT/i.test(sql)) return { rows: [{ id: 41, email: "test@example.com" }], rowCount: 1 };
      if (/^UPDATE/i.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    async connect() { return client; }
  };
}

test("translates SQLite placeholders and case-insensitive email comparisons", () => {
  const result = translateSqlToPostgres(
    "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
    ["User@Example.com"]
  );
  assert.match(result.sql, /LOWER\(email\) = LOWER\(\$1\)/i);
  assert.deepEqual(result.values, ["User@Example.com"]);
});

test("translates INSERT OR IGNORE into PostgreSQL conflict handling", () => {
  const result = translateSqlToPostgres(
    "INSERT OR IGNORE INTO user_presence (user_id, last_seen_at) VALUES (?, ?)",
    [7, 123],
    { isRun: true }
  );
  assert.match(result.sql, /^INSERT INTO user_presence/i);
  assert.match(result.sql, /ON CONFLICT DO NOTHING$/i);
  assert.deepEqual(result.values, [7, 123]);
});

test("adapter executes parameterized SELECT and returns the first row", async () => {
  const pool = makePool();
  const db = createPostgresDb(() => pool);
  const row = await db.get(
    "SELECT id, email FROM users WHERE email = ? COLLATE NOCASE",
    "TEST@example.com"
  );
  assert.deepEqual(row, { id: 41, email: "test@example.com" });
  assert.match(pool.calls[0].sql, /LOWER\(email\) = LOWER\(\$1\)/i);
  assert.deepEqual(pool.calls[0].values, ["TEST@example.com"]);
});

test("adapter adds RETURNING id and exposes insert result compatibly", async () => {
  const pool = makePool();
  const db = createPostgresDb(() => pool);
  const result = await db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
  ).run("Test User", "test@example.com", "hash", "user");
  assert.deepEqual(result, { changes: 1, lastInsertRowid: 41 });
  assert.match(pool.calls[0].sql, /RETURNING id$/i);
  assert.deepEqual(pool.calls[0].values, ["Test User", "test@example.com", "hash", "user"]);
});

test("adapter reports affected rows for UPDATE", async () => {
  const pool = makePool();
  const db = createPostgresDb(() => pool);
  const result = await db.run("UPDATE users SET name = ? WHERE id = ?", "Updated", 41);
  assert.deepEqual(result, { changes: 1, lastInsertRowid: null });
  assert.deepEqual(pool.calls[0].values, ["Updated", 41]);
});

test("transaction commits and releases its client on success", async () => {
  const pool = makePool();
  const db = createPostgresDb(() => pool);
  const result = await db.transaction(async () => "ok")();
  assert.equal(result, "ok");
  assert.deepEqual(pool.clientCalls.map((call) => call.sql), ["BEGIN", "COMMIT", "RELEASE_CLIENT"]);
});

test("transaction rolls back and releases its client on failure", async () => {
  const pool = makePool();
  const db = createPostgresDb(() => pool);
  await assert.rejects(
    db.transaction(async () => { throw new Error("expected failure"); })(),
    /expected failure/
  );
  assert.deepEqual(pool.clientCalls.map((call) => call.sql), ["BEGIN", "ROLLBACK", "RELEASE_CLIENT"]);
});
