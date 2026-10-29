#!/usr/bin/env node
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.resolve(path.dirname(filename), "..");
const mainDefault = path.join(dirname, "data", "maihoc.sqlite");
const resultsDefault = path.join(dirname, "data", "learning-results.sqlite");

// These are personal/activity records only. Shared learning content and audit history
// are intentionally excluded from the deletion list.
const OWNED_HISTORY_TABLES = [
  ["sessions", "user_id"],
  ["password_reset_tokens", "user_id"],
  ["email_verification_codes", "user_id"],
  ["account_action_tokens", "user_id"],
  ["user_presence", "user_id"],
  ["user_progress", "user_id"],
  ["exam_attempts", "user_id"],
  ["document_submissions", "user_id"],
  ["test_submissions", "user_id"],
  ["notifications", "user_id"],
  ["ai_solution_history", "user_id"]
];

export function quoteIdentifier(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

function tableExists(db, table) {
  return Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
  ).get(table));
}

function columnExists(db, table, column) {
  return tableExists(db, table) &&
    db.pragma("table_info(" + quoteIdentifier(table) + ")").some((item) => item.name === column);
}

function countWhere(db, table, where, params = []) {
  if (!tableExists(db, table)) return 0;
  return Number(db.prepare(
    "SELECT COUNT(*) AS count FROM " + quoteIdentifier(table) + " WHERE " + where
  ).get(...params).count);
}

export function assertSingleAdmin(db, userId) {
  if (Number(userId) !== 1) throw new Error("Chỉ hỗ trợ dọn lịch sử của admin ID 1.");
  if (!tableExists(db, "users")) throw new Error("Không tìm thấy bảng users.");
  const users = db.prepare("SELECT id, role FROM users ORDER BY id").all();
  if (users.length !== 1 || Number(users[0].id) !== Number(userId) || users[0].role !== "admin") {
    throw new Error(
      "Dừng thao tác: chỉ tiếp tục khi database có đúng một tài khoản admin được xác nhận. " +
      "Hiện tại: " + JSON.stringify(users.map(({ id, role }) => ({ id, role })))
    );
  }
}

function collectMainCounts(db, userId) {
  const rows = [];
  for (const [table, column] of OWNED_HISTORY_TABLES) {
    if (!columnExists(db, table, column)) continue;
    rows.push({
      table,
      column,
      rows: countWhere(db, table, quoteIdentifier(column) + " = ?", [userId])
    });
  }

  if (columnExists(db, "account_deletion_requests", "target_user_id")) {
    const whereColumns = ["target_user_id", "requested_by", "reviewed_by"]
      .filter((column) => columnExists(db, "account_deletion_requests", column));
    const predicate = whereColumns.map((column) => quoteIdentifier(column) + " = ?").join(" OR ");
    rows.push({
      table: "account_deletion_requests",
      column: whereColumns.join("|"),
      rows: predicate
        ? countWhere(db, "account_deletion_requests", predicate, whereColumns.map(() => userId))
        : 0
    });
  }

  if (columnExists(db, "chat_messages", "sender_id")) {
    rows.push({
      table: "chat_messages",
      column: "sender_id",
      rows: countWhere(db, "chat_messages", '"sender_id" = ?', [userId])
    });
  }
  if (columnExists(db, "chat_participants", "user_id")) {
    rows.push({
      table: "chat_participants",
      column: "user_id",
      rows: countWhere(db, "chat_participants", '"user_id" = ?', [userId])
    });
  }
  if (tableExists(db, "chat_conversations") &&
      columnExists(db, "chat_conversations", "id") &&
      columnExists(db, "chat_conversations", "type") &&
      columnExists(db, "chat_participants", "conversation_id")) {
    rows.push({
      table: "chat_conversations",
      column: "direct conversations joined by user",
      rows: Number(db.prepare(`
        SELECT COUNT(*) AS count
        FROM chat_conversations c
        WHERE c.type='direct'
          AND c.id IN (
            SELECT p.conversation_id FROM chat_participants p WHERE p.user_id=?
          )
      `).get(userId).count)
    });
  }
  return rows;
}

export function buildPersonalHistoryReport(mainDb, resultsDb, userId = 1) {
  assertSingleAdmin(mainDb, userId);
  const mainHealth = mainDb.prepare("PRAGMA integrity_check").all().map((row) => String(Object.values(row)[0]));
  const resultsHealth = resultsDb.prepare("PRAGMA integrity_check").all().map((row) => String(Object.values(row)[0]));
  const mainForeignKeys = mainDb.prepare("PRAGMA foreign_key_check").all();
  const resultsForeignKeys = resultsDb.prepare("PRAGMA foreign_key_check").all();

  const activity = collectMainCounts(mainDb, userId);
  const learningResults = columnExists(resultsDb, "learning_results", "user_id")
    ? countWhere(resultsDb, "learning_results", '"user_id" = ?', [userId])
    : 0;

  const preserved = {};
  for (const table of ["users", "documents", "tests", "answer_keys", "exam_solutions", "exam_solution_reviews", "subjects_catalog", "app_migrations"]) {
    if (table === "subjects_catalog" && !tableExists(resultsDb, table)) {
      preserved[table] = tableExists(mainDb, table)
        ? Number(mainDb.prepare("SELECT COUNT(*) AS count FROM " + quoteIdentifier(table)).get().count)
        : 0;
    } else {
      const source = table === "subjects_catalog" ? resultsDb : mainDb;
      preserved[table] = tableExists(source, table)
        ? Number(source.prepare("SELECT COUNT(*) AS count FROM " + quoteIdentifier(table)).get().count)
        : 0;
    }
  }

  return {
    mode: "DRY RUN",
    targetAdmin: { id: Number(userId), role: "admin" },
    health: {
      mainIntegrity: mainHealth.length === 1 && mainHealth[0] === "ok" ? "ok" : mainHealth,
      resultsIntegrity: resultsHealth.length === 1 && resultsHealth[0] === "ok" ? "ok" : resultsHealth,
      mainForeignKeyViolations: mainForeignKeys.length,
      resultsForeignKeyViolations: resultsForeignKeys.length
    },
    personalHistoryCandidates: {
      main: activity,
      learningResults
    },
    preservedSharedDataCounts: preserved,
    warning: "Preview only. No rows are changed. Applying deletes only the explicitly listed personal/activity records for the target admin; it keeps shared documents, tests, solutions, review/audit records, subject catalog, and the admin account."
  };
}

export function deletePersonalHistory(mainDb, resultsDb, userId = 1) {
  assertSingleAdmin(mainDb, userId);
  const result = { main: {}, results: {} };

  // The two SQLite files cannot share one atomic transaction. Callers must make
  // verified backups of both files before applying this cleanup.
  const mainTransaction = mainDb.transaction(() => {
    for (const [table, column] of OWNED_HISTORY_TABLES) {
      if (!columnExists(mainDb, table, column)) continue;
      result.main[table] = mainDb.prepare(
        "DELETE FROM " + quoteIdentifier(table) + " WHERE " + quoteIdentifier(column) + " = ?"
      ).run(userId).changes;
    }

    if (columnExists(mainDb, "account_deletion_requests", "target_user_id")) {
      const columns = ["target_user_id", "requested_by", "reviewed_by"]
        .filter((column) => columnExists(mainDb, "account_deletion_requests", column));
      const predicate = columns.map((column) => quoteIdentifier(column) + " = ?").join(" OR ");
      if (predicate) {
        result.main.account_deletion_requests = mainDb.prepare(
          "DELETE FROM account_deletion_requests WHERE " + predicate
        ).run(...columns.map(() => userId)).changes;
      }
    }

    // Remove this user's messages and membership. Keep the global chat room itself:
    // chat.js recreates the user's global-room membership when they open the chat.
    if (columnExists(mainDb, "chat_messages", "sender_id")) {
      result.main.chat_messages = mainDb.prepare(
        'DELETE FROM "chat_messages" WHERE "sender_id" = ?'
      ).run(userId).changes;
    }

    if (tableExists(mainDb, "chat_conversations") &&
        columnExists(mainDb, "chat_conversations", "id") &&
        columnExists(mainDb, "chat_conversations", "type") &&
        columnExists(mainDb, "chat_participants", "conversation_id") &&
        columnExists(mainDb, "chat_participants", "user_id")) {
      const directIds = mainDb.prepare(`
        SELECT c.id
        FROM chat_conversations c
        WHERE c.type='direct'
          AND c.id IN (SELECT p.conversation_id FROM chat_participants p WHERE p.user_id=?)
      `).all(userId).map((row) => row.id);

      if (directIds.length) {
        const placeholders = directIds.map(() => "?").join(",");
        if (columnExists(mainDb, "chat_messages", "conversation_id")) {
          result.main.direct_chat_messages = mainDb.prepare(
            "DELETE FROM chat_messages WHERE conversation_id IN (" + placeholders + ")"
          ).run(...directIds).changes;
        }
        result.main.direct_chat_participants = mainDb.prepare(
          "DELETE FROM chat_participants WHERE conversation_id IN (" + placeholders + ")"
        ).run(...directIds).changes;
        result.main.direct_chat_conversations = mainDb.prepare(
          "DELETE FROM chat_conversations WHERE type='direct' AND id IN (" + placeholders + ")"
        ).run(...directIds).changes;
      }
    }

    if (columnExists(mainDb, "chat_participants", "user_id")) {
      result.main.chat_participants = (result.main.chat_participants || 0) +
        mainDb.prepare('DELETE FROM "chat_participants" WHERE "user_id" = ?').run(userId).changes;
    }

    // Deliberately preserve shared content and audit/provenance fields:
    // documents, tests, answer_keys, exam_solutions, exam_solution_reviews.
    assertSingleAdmin(mainDb, userId);
  });

  const resultsTransaction = resultsDb.transaction(() => {
    if (columnExists(resultsDb, "learning_results", "user_id")) {
      result.results.learning_results = resultsDb.prepare(
        'DELETE FROM "learning_results" WHERE "user_id" = ?'
      ).run(userId).changes;
    }
  });

  // Run the results file first. If the main transaction subsequently fails, both
  // backups are required to restore a consistent pre-cleanup state.
  resultsTransaction();
  mainTransaction();
  assertSingleAdmin(mainDb, userId);

  return result;
}

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function backupDatabase(db, originalPath) {
  const destination = originalPath + ".pre-cutover-history-" + stamp() + ".bak";
  if (fs.existsSync(destination)) throw new Error("File backup đã tồn tại: " + destination);
  await db.backup(destination);
  return destination;
}

async function main() {
  const mainPath = path.resolve(readArg("--main-db", mainDefault));
  const resultsPath = path.resolve(readArg("--results-db", resultsDefault));
  const userId = Number(readArg("--user-id", "1"));
  const apply = process.argv.includes("--apply");
  const confirmId = readArg("--confirm-user-id");

  if (mainPath === resultsPath) throw new Error("Hai database path không được trỏ tới cùng một file.");
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("--user-id phải là số nguyên dương.");
  if (apply && confirmId !== String(userId)) {
    throw new Error("Để áp dụng, cần chỉ định --confirm-user-id với đúng ID đã xem trong báo cáo.");
  }
  for (const file of [mainPath, resultsPath]) {
    if (!fs.existsSync(file)) throw new Error("Không tìm thấy SQLite database: " + file);
  }

  const mainDb = new Database(mainPath, { readonly: !apply, fileMustExist: true });
  const resultsDb = new Database(resultsPath, { readonly: !apply, fileMustExist: true });
  try {
    mainDb.pragma("foreign_keys = ON");
    resultsDb.pragma("foreign_keys = ON");

    const report = {
      ...buildPersonalHistoryReport(mainDb, resultsDb, userId),
      mode: apply ? "APPLY PREVIEW" : "DRY RUN"
    };
    console.log(JSON.stringify(report, null, 2));
    const unhealthy = report.health.mainIntegrity !== "ok" ||
      report.health.resultsIntegrity !== "ok" ||
      report.health.mainForeignKeyViolations !== 0 ||
      report.health.resultsForeignKeyViolations !== 0;
    if (unhealthy) throw new Error("Dừng lại: có lỗi integrity hoặc foreign key cần xử lý trước.");

    if (!apply) {
      console.log("DRY RUN: chưa có dữ liệu nào thay đổi. Hãy rà soát báo cáo và backup trước khi áp dụng.");
      return;
    }

    const adminCount = mainDb.prepare("SELECT COUNT(*) AS count FROM users").get().count;
    if (Number(adminCount) !== 1) throw new Error("Dừng lại: users phải chỉ còn đúng admin ID 1.");

    const mainBackup = await backupDatabase(mainDb, mainPath);
    const resultsBackup = await backupDatabase(resultsDb, resultsPath);
    console.log(JSON.stringify({ verifiedBackups: { main: mainBackup, results: resultsBackup } }, null, 2));

    const deleted = deletePersonalHistory(mainDb, resultsDb, userId);
    console.log(JSON.stringify({ mode: "APPLIED", deleted }, null, 2));
    console.log("Đã dọn lịch sử cá nhân được chọn. Không xóa tài khoản admin hay nội dung học tập dùng chung.");
  } finally {
    resultsDb.close();
    mainDb.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === filename) {
  main().catch((error) => {
    console.error("LỖI CLEANUP HISTORY:", error.message);
    process.exitCode = 1;
  });
}
