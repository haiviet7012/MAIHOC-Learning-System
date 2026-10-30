#!/usr/bin/env node
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const EPHEMERAL_TABLES = new Set([
  "sessions",
  "password_reset_tokens",
  "email_verification_codes",
  "account_action_tokens",
  "user_presence"
]);
const PERSONAL_ACTIVITY_TABLES = new Set([
  "user_progress",
  "exam_attempts",
  "learning_results",
  "chat_conversations",
  "chat_messages",
  "chat_participants",
  "notifications",
  "ai_solution_history",
  "account_deletion_requests"
]);
const SUBMISSION_TABLES = new Set(["document_submissions", "test_submissions"]);
const SHARED_CONTENT_TABLES = new Set([
  "documents",
  "tests",
  "answer_keys",
  "exam_solutions",
  "exam_solution_reviews",
  "subjects_catalog",
  "app_migrations"
]);
const OWNER_COLUMNS = new Set([
  "user_id",
  "owner_id",
  "owner_user_id",
  "creator_id",
  "creator_user_id",
  "uploaded_by",
  "reviewed_by",
  "approved_by",
  "requested_by",
  "requested_by_id",
  "target_user_id",
  "graded_by_id",
  "admin_id",
  "created_by",
  "created_by_id",
  "deleted_by",
  "sender_id",
  "from_user_id",
  "to_user_id"
]);

export function quoteIdentifier(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

export function classifyTable(tableName) {
  if (EPHEMERAL_TABLES.has(tableName)) return "ephemeral";
  if (PERSONAL_ACTIVITY_TABLES.has(tableName)) return "personal_activity_review";
  if (SUBMISSION_TABLES.has(tableName)) return "user_submissions_review";
  if (SHARED_CONTENT_TABLES.has(tableName)) return "shared_content_or_audit";
  if (tableName === "users") return "accounts";
  return "review_manually";
}

function ownerBreakdown(db, tableName, columnName) {
  const rows = db.prepare(
    "SELECT " + quoteIdentifier(columnName) + " AS owner_id, COUNT(*) AS row_count FROM " +
    quoteIdentifier(tableName) + " GROUP BY " + quoteIdentifier(columnName) +
    " ORDER BY " + quoteIdentifier(columnName)
  ).all();
  return rows.map((row) => ({
    ownerId: row.owner_id == null ? null : String(row.owner_id),
    rows: Number(row.row_count)
  }));
}

export function buildDatabaseReport(db, sourceName) {
  const integrityRows = db.prepare("PRAGMA integrity_check").all();
  const integrity = integrityRows.map((row) => String(Object.values(row)[0]));
  const foreignKeyProblems = db.prepare("PRAGMA foreign_key_check").all();

  const sourceTables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all();

  const tables = sourceTables.map(({ name }) => {
    const columns = db.pragma("table_info(" + quoteIdentifier(name) + ")");
    const columnNames = new Set(columns.map((column) => column.name));
    const ownership = columns
      .filter((column) => OWNER_COLUMNS.has(column.name) || /_user_id$/.test(column.name))
      .map((column) => ({
        column: column.name,
        owners: ownerBreakdown(db, name, column.name)
      }));
    const row = db.prepare("SELECT COUNT(*) AS count FROM " + quoteIdentifier(name)).get();

    return {
      table: name,
      classification: classifyTable(name),
      rows: Number(row.count),
      ownerColumnsDetected: [...columnNames].filter((column) =>
        OWNER_COLUMNS.has(column) || /_user_id$/.test(column)
      ),
      ownership
    };
  });

  return {
    source: sourceName,
    health: {
      integrity: integrity.length === 1 && integrity[0] === "ok" ? "ok" : integrity,
      foreignKeyViolations: foreignKeyProblems.length,
      foreignKeyExamples: foreignKeyProblems.slice(0, 5)
    },
    tableCount: tables.length,
    totalRows: tables.reduce((sum, table) => sum + table.rows, 0),
    tables
  };
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function main() {
  const mainPath = path.resolve(readArg("--main-db", path.join(dirname, "data", "maihoc.sqlite")));
  const resultsPath = path.resolve(readArg("--results-db", path.join(dirname, "data", "learning-results.sqlite")));
  if (mainPath === resultsPath) throw new Error("Hai đường dẫn SQLite không được trỏ tới cùng một file.");

  for (const file of [mainPath, resultsPath]) {
    if (!fs.existsSync(file)) throw new Error("Không tìm thấy SQLite database: " + file);
  }

  const opened = [];
  try {
    const mainDb = new Database(mainPath, { readonly: true, fileMustExist: true });
    opened.push(mainDb);
    const resultsDb = new Database(resultsPath, { readonly: true, fileMustExist: true });
    opened.push(resultsDb);

    const report = {
      mode: "READ-ONLY CUTOVER REPORT",
      generatedAt: new Date().toISOString(),
      note: "Báo cáo chỉ đọc; không xóa, sửa hoặc ghi dữ liệu.",
      sources: [
        buildDatabaseReport(mainDb, "main"),
        buildDatabaseReport(resultsDb, "results")
      ]
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    for (const db of opened.reverse()) db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === filename) {
  try {
    main();
  } catch (error) {
    console.error("LỖI CUTOVER PREFLIGHT:", error.message);
    process.exitCode = 1;
  }
}
