import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  buildPersonalHistoryReport,
  deletePersonalHistory
} from "../scripts/cleanup-personal-history.js";

function createMainDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT NOT NULL);
    INSERT INTO users VALUES (1, 'admin');

    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE);
    INSERT INTO sessions VALUES ('session-1', 1);

    CREATE TABLE user_progress (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE);
    INSERT INTO user_progress VALUES (1, 1);

    CREATE TABLE exam_attempts (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE);
    INSERT INTO exam_attempts VALUES (1, 1);

    CREATE TABLE documents (id TEXT PRIMARY KEY, uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL);
    INSERT INTO documents VALUES ('doc-1', 1);

    CREATE TABLE tests (id TEXT PRIMARY KEY, created_by INTEGER REFERENCES users(id) ON DELETE SET NULL);
    INSERT INTO tests VALUES ('test-1', 1);

    CREATE TABLE exam_solutions (document_id TEXT PRIMARY KEY, approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL);
    INSERT INTO exam_solutions VALUES ('doc-1', 1);

    CREATE TABLE exam_solution_reviews (id INTEGER PRIMARY KEY, reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL);
    INSERT INTO exam_solution_reviews VALUES (1, 1);

    CREATE TABLE chat_conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('global', 'direct'))
    );
    INSERT INTO chat_conversations VALUES ('global', 'global');
    INSERT INTO chat_conversations VALUES ('direct_1_2', 'direct');

    CREATE TABLE chat_participants (
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (conversation_id, user_id)
    );
    INSERT INTO chat_participants VALUES ('global', 1);
    INSERT INTO chat_participants VALUES ('direct_1_2', 1);

    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );
    INSERT INTO chat_messages VALUES (1, 'global', 1);
    INSERT INTO chat_messages VALUES (2, 'direct_1_2', 1);
  `);
  return db;
}

function createResultsDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE learning_results (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL);
    INSERT INTO learning_results VALUES (1, 1);
    CREATE TABLE subjects_catalog (code TEXT PRIMARY KEY, name TEXT);
    INSERT INTO subjects_catalog VALUES ('toan', 'Toán');
  `);
  return db;
}

test("preview is read-only and identifies personal histories while preserving shared counts", () => {
  const main = createMainDb();
  const results = createResultsDb();
  try {
    const report = buildPersonalHistoryReport(main, results, 1);
    assert.equal(report.mode, "DRY RUN");
    assert.equal(report.health.mainIntegrity, "ok");
    assert.equal(report.health.resultsIntegrity, "ok");
    assert.equal(report.health.mainForeignKeyViolations, 0);
    assert.equal(report.health.resultsForeignKeyViolations, 0);
    assert.equal(report.personalHistoryCandidates.learningResults, 1);
    assert.equal(report.preservedSharedDataCounts.documents, 1);
    assert.equal(report.preservedSharedDataCounts.tests, 1);
    assert.equal(report.preservedSharedDataCounts.exam_solution_reviews, 1);
    assert.equal(main.prepare("SELECT COUNT(*) AS n FROM user_progress").get().n, 1);
    assert.equal(results.prepare("SELECT COUNT(*) AS n FROM learning_results").get().n, 1);
  } finally {
    main.close();
    results.close();
  }
});

test("cleanup deletes personal history but keeps admin, shared content, audit, and global chat", () => {
  const main = createMainDb();
  const results = createResultsDb();
  try {
    const deleted = deletePersonalHistory(main, results, 1);
    assert.equal(deleted.main.user_progress, 1);
    assert.equal(deleted.main.exam_attempts, 1);
    assert.equal(deleted.main.sessions, 1);
    assert.equal(deleted.results.learning_results, 1);

    assert.equal(main.prepare("SELECT COUNT(*) AS n FROM users WHERE id=1 AND role='admin'").get().n, 1);
    assert.equal(main.prepare("SELECT COUNT(*) AS n FROM documents").get().n, 1);
    assert.equal(main.prepare("SELECT COUNT(*) AS n FROM tests").get().n, 1);
    assert.equal(main.prepare("SELECT COUNT(*) AS n FROM exam_solutions").get().n, 1);
    assert.equal(main.prepare("SELECT COUNT(*) AS n FROM exam_solution_reviews").get().n, 1);
    assert.equal(main.prepare("SELECT COUNT(*) AS n FROM chat_conversations WHERE id='global'").get().n, 1);
    assert.equal(main.prepare("SELECT COUNT(*) AS n FROM chat_conversations WHERE type='direct'").get().n, 0);
    assert.equal(main.prepare("SELECT COUNT(*) AS n FROM chat_messages").get().n, 0);
    assert.equal(main.prepare("SELECT COUNT(*) AS n FROM chat_participants WHERE user_id=1").get().n, 0);
    assert.equal(results.prepare("SELECT COUNT(*) AS n FROM learning_results").get().n, 0);
  } finally {
    main.close();
    results.close();
  }
});

test("cleanup refuses to run if other user accounts exist", () => {
  const main = createMainDb();
  const results = createResultsDb();
  try {
    main.prepare("INSERT INTO users VALUES (2, 'user')").run();
    assert.throws(() => deletePersonalHistory(main, results, 1), /đúng một tài khoản admin/);
  } finally {
    main.close();
    results.close();
  }
});
