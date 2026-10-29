import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  buildDatabaseReport,
  classifyTable,
  quoteIdentifier
} from "../inspect-postgres-cutover.js";

test("quotes SQLite identifiers safely", () => {
  assert.equal(quoteIdentifier('a"b'), '"a""b"');
});

test("classifies activity and shared-content tables without making deletion decisions", () => {
  assert.equal(classifyTable("sessions"), "ephemeral");
  assert.equal(classifyTable("user_progress"), "personal_activity_review");
  assert.equal(classifyTable("document_submissions"), "user_submissions_review");
  assert.equal(classifyTable("documents"), "shared_content_or_audit");
  assert.equal(classifyTable("unexpected_table"), "review_manually");
});

test("reports rows and user ownership breakdown without modifying the database", () => {
  const db = new Database(":memory:");
  try {
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE user_progress (id INTEGER PRIMARY KEY, user_id INTEGER, item_id TEXT);
      INSERT INTO users VALUES (1, 'Admin');
      INSERT INTO user_progress VALUES (1, 1, 'lesson-a');
      INSERT INTO user_progress VALUES (2, 1, 'lesson-b');
      INSERT INTO user_progress VALUES (3, 42, 'load-test');
    `);

    const report = buildDatabaseReport(db, "test");
    assert.equal(report.source, "test");
    assert.equal(report.health.integrity, "ok");
    assert.equal(report.health.foreignKeyViolations, 0);
    assert.equal(report.tableCount, 2);
    assert.equal(report.totalRows, 4);

    const progress = report.tables.find((table) => table.table === "user_progress");
    assert.equal(progress.classification, "personal_activity_review");
    assert.equal(progress.rows, 3);
    assert.deepEqual(progress.ownership[0].owners, [
      { ownerId: "1", rows: 2 },
      { ownerId: "42", rows: 1 }
    ]);

    // This is a report-only helper; no table rows should be changed.
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM user_progress").get().n, 3);
  } finally {
    db.close();
  }
});
