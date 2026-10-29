#!/usr/bin/env node
import Database from "better-sqlite3";
import path from "node:path";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}
const mainPath = path.resolve(arg("--main-db", "data/maihoc.sqlite"));
const resultsPath = path.resolve(arg("--results-db", "data/learning-results.sqlite"));
const idsRaw = arg("--user-ids", "");
const apply = process.argv.includes("--apply");
const ids = [...new Set(idsRaw.split(",").map((x) => Number(x.trim())).filter((x) => Number.isSafeInteger(x) && x > 0))];
if (!ids.length) {
  fail("Supply reviewed positive IDs through --user-ids 1,2,3. Use preview-k6-users.js first.");
  process.exit();
}
const main = new Database(mainPath, { fileMustExist: true });
const results = new Database(resultsPath, { fileMustExist: true });
try {
  main.pragma("foreign_keys = ON");
  results.pragma("foreign_keys = ON");
  const placeholders = ids.map(() => "?").join(",");
  const users = main.prepare(`SELECT id, name, email, role FROM users WHERE id IN (${placeholders}) ORDER BY id`).all(...ids);
  if (users.length !== ids.length) {
    fail(`Some IDs don't exist in main DB. requested=${ids.length}, found=${users.length}. No changes applied.`);
    process.exit();
  }
  const admins = main.prepare("SELECT id FROM users WHERE role='admin'").all().map((r) => r.id);
  if (users.some((u) => u.role === "admin") || admins.every((id) => ids.includes(id))) {
    fail("Deletion list includes an admin or would leave no admin. No changes applied.");
    process.exit();
  }

  const resultCounts = results.prepare(`SELECT user_id, COUNT(*) AS count FROM learning_results WHERE user_id IN (${placeholders}) GROUP BY user_id`).all(...ids);
  const perUserRelated = {};
  for (const table of ["sessions","password_reset_tokens","email_verification_codes","user_presence","user_progress","exam_attempts","document_submissions","notifications","ai_solution_history","chat_participants","chat_messages"]) {
    const exists = main.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!exists) continue;
    const columns = main.pragma(`table_info(${table})`).map((c) => c.name);
    if (!columns.includes("user_id")) continue;
    perUserRelated[table] = main.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id IN (${placeholders})`).get(...ids).count;
  }
  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "DRY RUN",
    targetUsers: users,
    mainDbRelatedRowsByTable: perUserRelated,
    resultsDbLearningResultRows: resultCounts.reduce((sum, row) => sum + Number(row.count), 0),
    retainedAdminIds: admins.filter((id) => !ids.includes(id)),
    note: "Shared documents, tests, answer_keys, and exam_solutions are not intentionally deleted."
  }, null, 2));

  if (!apply) {
    console.log("Dry run only. Re-run with --apply only after reviewing IDs and verifying backups.");
    process.exit();
  }

  // Individual DB transactions are atomic within each file, but SQLite cannot atomically commit across two files.
  results.transaction(() => {
    results.prepare(`DELETE FROM learning_results WHERE user_id IN (${placeholders})`).run(...ids);
  })();

  try {
    main.transaction(() => {
      for (const table of ["sessions","password_reset_tokens","email_verification_codes","user_presence","user_progress","exam_attempts","document_submissions","notifications","ai_solution_history","chat_participants","chat_messages"]) {
        const exists = main.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
        if (!exists) continue;
        const columns = main.pragma(`table_info(${table})`).map((c) => c.name);
        if (columns.includes("user_id")) {
          main.prepare(`DELETE FROM ${table} WHERE user_id IN (${placeholders})`).run(...ids);
        }
      }
      for (const [table, column] of [
        ["account_action_tokens", "user_id"],
        ["account_deletion_requests", "target_user_id"],
        ["account_deletion_requests", "requested_by"],
        ["account_deletion_requests", "reviewed_by"],
        ["exam_solution_reviews", "reviewed_by"],
        ["exam_solutions", "approved_by"],
        ["documents", "uploaded_by"],
        ["answer_keys", "uploaded_by"],
        ["tests", "created_by"],
        ["test_submissions", "graded_by"],
        ["document_submissions", "reviewed_by"]
      ]) {
        const exists = main.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
        if (!exists) continue;
        const columns = main.pragma(`table_info(${table})`).map((c) => c.name);
        if (!columns.includes(column)) continue;
        if (table === "account_action_tokens" || (table === "account_deletion_requests" && column === "target_user_id")) {
          main.prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`).run(...ids);
        } else {
          // Set attribution columns to NULL to preserve shared content/records.
          try { main.prepare(`UPDATE ${table} SET ${column}=NULL WHERE ${column} IN (${placeholders})`).run(...ids); } catch {}
        }
      }
      main.prepare(`DELETE FROM users WHERE id IN (${placeholders}) AND role <> 'admin'`).run(...ids);
      const remaining = main.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin'").get().count;
      if (!remaining) throw new Error("Guard failed: no admin remains; transaction will roll back.");
    })();
  } catch (error) {
    console.error("Main DB deletion failed. The results DB transaction may already be committed because the DBs are separate.");
    console.error("Restore BOTH database files from backups before retrying.", error.message);
    process.exitCode = 1;
    process.exit();
  }
  console.log("Cleanup completed. Verify login, document listing, tests, submissions, and result counts.");
} finally {
  main.close();
  results.close();
}
