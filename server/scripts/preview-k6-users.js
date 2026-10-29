#!/usr/bin/env node
import Database from "better-sqlite3";
import path from "node:path";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const dbPath = path.resolve(arg("--db", "data/maihoc.sqlite"));
const emailRegexText = arg("--email-regex", "(?i)(k6|loadtest|load-test|grafana|vu[0-9]+|testuser[0-9]+)");
const flags = emailRegexText.startsWith("(?i)") ? "i" : "";
const pattern = new RegExp(emailRegexText.replace(/^\(\?i\)/, ""), flags);
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
try {
  const users = db.prepare("SELECT id, name, email, role, created_at FROM users ORDER BY id").all();
  const candidates = users.filter((user) => pattern.test(String(user.email || "")) || pattern.test(String(user.name || "")));
  const admins = users.filter((user) => user.role === "admin");
  console.log(JSON.stringify({
    database: dbPath,
    totalUsers: users.length,
    adminCount: admins.length,
    admins: admins.map(({ id, name, email, role }) => ({ id, name, email, role })),
    candidateCount: candidates.length,
    candidates,
    warning: "Read-only preview only. Review the candidate list; don't assume a regex match proves an account is synthetic."
  }, null, 2));
} finally {
  db.close();
}
