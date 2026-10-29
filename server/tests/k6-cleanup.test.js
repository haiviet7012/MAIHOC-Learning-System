import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const script = path.resolve("scripts/cleanup-k6-users.js");

function buildDb(file, schema, insert) {
  const db = new Database(file);
  db.pragma("foreign_keys=ON");
  db.exec(schema);
  if (insert) insert(db);
  db.close();
}

test("cleanup script defaults to dry-run and does not modify either database", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maihoc-cleanup-dry-"));
  const mainPath = path.join(dir, "main.sqlite");
  const resultsPath = path.join(dir, "results.sqlite");
  try {
    buildDb(mainPath, `
      CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT, email TEXT, role TEXT);
      CREATE TABLE sessions(user_id INTEGER);
      INSERT INTO users VALUES(1,'Admin','admin@example.test','admin');
      INSERT INTO users VALUES(2,'k6 user','k6-2@example.test','user');
      INSERT INTO sessions VALUES(2);
    `);
    buildDb(resultsPath, `
      CREATE TABLE learning_results(user_id INTEGER);
      INSERT INTO learning_results VALUES(2);
    `);
    const run = spawnSync(process.execPath, [script,
      "--main-db", mainPath, "--results-db", resultsPath, "--user-ids", "2"
    ], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const main = new Database(mainPath, { readonly: true });
    const results = new Database(resultsPath, { readonly: true });
    assert.equal(main.prepare("SELECT COUNT(*) AS c FROM users").get().c, 2);
    assert.equal(main.prepare("SELECT COUNT(*) AS c FROM sessions").get().c, 1);
    assert.equal(results.prepare("SELECT COUNT(*) AS c FROM learning_results").get().c, 1);
    main.close();
    results.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("cleanup refuses to target an admin, even when --apply is provided", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maihoc-cleanup-admin-"));
  const mainPath = path.join(dir, "main.sqlite");
  const resultsPath = path.join(dir, "results.sqlite");
  try {
    buildDb(mainPath, `
      CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT, email TEXT, role TEXT);
      INSERT INTO users VALUES(1,'Admin','admin@example.test','admin');
      INSERT INTO users VALUES(2,'k6 user','k6-2@example.test','user');
    `);
    buildDb(resultsPath, `CREATE TABLE learning_results(user_id INTEGER);`);
    const run = spawnSync(process.execPath, [script,
      "--main-db", mainPath, "--results-db", resultsPath, "--user-ids", "1", "--apply"
    ], { encoding: "utf8" });
    assert.notEqual(run.status, 0);
    const main = new Database(mainPath, { readonly: true });
    assert.equal(main.prepare("SELECT COUNT(*) AS c FROM users WHERE role='admin'").get().c, 1);
    main.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
