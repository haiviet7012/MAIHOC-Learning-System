import crypto from "node:crypto";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// const db = require('./db'); // Nạp kết nối SQLite từ file db.js cùng thư mục
const scrypt = promisify(crypto.scrypt);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "maihoc.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
    admin_level INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL, item_id TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT 'Toán', grade TEXT NOT NULL DEFAULT '10',
    status TEXT NOT NULL DEFAULT 'in_progress',
    progress_percent INTEGER NOT NULL DEFAULT 0 CHECK(progress_percent BETWEEN 0 AND 100),
    score REAL, answers_json TEXT, last_position TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id,item_type,item_id)
  );
  CREATE TABLE IF NOT EXISTS document_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL, grade TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL,
    filename TEXT NOT NULL, original_name TEXT NOT NULL, size INTEGER NOT NULL,
    file_data BLOB,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    answer_key_data BLOB,
    answer_key_original_name TEXT,
    answer_key_content_type TEXT,
    answer_key_question_ids TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    admin_note TEXT, reviewed_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), reviewed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL, grade TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL,
    filename TEXT NOT NULL, original_name TEXT NOT NULL, size INTEGER NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    answer_key_data BLOB,
    answer_key_original_name TEXT,
    answer_key_content_type TEXT,
    answer_key_question_ids TEXT,
    file_data BLOB NOT NULL,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS answer_keys (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    file_data BLOB NOT NULL,
    source_format TEXT NOT NULL,
    normalized_json TEXT,
    question_ids TEXT,
    grading_available INTEGER NOT NULL DEFAULT 0 CHECK(grading_available IN (0,1)),
    normalization_error TEXT,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS exam_solutions (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','reading','solving','review','ready','failed')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
    phase TEXT NOT NULL DEFAULT 'queued',
    model TEXT,
    source_hash TEXT,
    generated_json TEXT,
    approved_json TEXT,
    error_code TEXT,
    error_message TEXT,
    solution_version INTEGER NOT NULL DEFAULT 1,
    generated_at TEXT,
    approved_at TEXT,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS exam_solution_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    solution_version INTEGER NOT NULL,
    target_id TEXT NOT NULL,
    decision TEXT NOT NULL CHECK(decision IN ('correct','corrected')),
    before_json TEXT NOT NULL,
    after_json TEXT NOT NULL,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS app_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, link TEXT, read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, read_at, id DESC);
  CREATE TABLE IF NOT EXISTS account_deletion_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_user_id INTEGER NOT NULL,
    target_name TEXT NOT NULL,
    target_email TEXT NOT NULL,
    target_role TEXT NOT NULL,
    requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    requested_by_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS account_deletion_requests_status_idx ON account_deletion_requests(status, requested_at);
`);

const userColumns = new Set(db.pragma("table_info(users)").map((column) => column.name));
if (!userColumns.has("admin_level")) {
  db.exec("ALTER TABLE users ADD COLUMN admin_level INTEGER NOT NULL DEFAULT 0");
}

const submissionColumns = new Set(
  db.pragma("table_info(document_submissions)").map((column) => column.name)
);
if (!submissionColumns.has("file_data")) {
  db.exec("ALTER TABLE document_submissions ADD COLUMN file_data BLOB");
}
if (!submissionColumns.has("content_type")) {
  db.exec("ALTER TABLE document_submissions ADD COLUMN content_type TEXT NOT NULL DEFAULT 'application/octet-stream'");
}
for (const [name, definition] of [
  ["answer_key_data", "BLOB"],
  ["answer_key_original_name", "TEXT"],
  ["answer_key_content_type", "TEXT"],
  ["answer_key_question_ids", "TEXT"]
]) {
  if (!submissionColumns.has(name)) db.exec(`ALTER TABLE document_submissions ADD COLUMN ${name} ${definition}`);
}
const documentColumns = new Set(db.pragma("table_info(documents)").map((column) => column.name));
for (const [name, definition] of [
  ["answer_key_data", "BLOB"],
  ["answer_key_original_name", "TEXT"],
  ["answer_key_content_type", "TEXT"],
  ["answer_key_question_ids", "TEXT"]
]) {
  if (!documentColumns.has(name)) db.exec(`ALTER TABLE documents ADD COLUMN ${name} ${definition}`);
}
const progressColumns = new Set(
  db.pragma("table_info(user_progress)").map((column) => column.name)
);
if (!progressColumns.has("item_title")) {
  db.exec("ALTER TABLE user_progress ADD COLUMN item_title TEXT NOT NULL DEFAULT ''");
}

const SESSION_COOKIE = "maihoc.sid";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const cookieSecure = () => process.env.NODE_ENV === "production";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function parseCookies(header = "") {
  const result = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}
function writeCookie(res, token, maxAgeSeconds) {
  const secure = cookieSecure() ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
}

export function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, adminLevel: Number(user.admin_level || 0), createdAt: user.created_at };
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
}
export async function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const expected = Buffer.from(hash, "hex");
    const actual = Buffer.from(await scrypt(String(password), salt, expected.length, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch { return false; }
}

export async function registerUser({ name, email, password }) {
  const safeName = String(name || "").trim();
  const safeEmail = String(email || "").trim().toLowerCase();
  const secret = String(password || "");
  if (safeName.length < 2 || safeName.length > 80) throw new Error("Tên cần có từ 2 đến 80 ký tự.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail) || safeEmail.length > 254) throw new Error("Email không hợp lệ.");
  if (secret.length < 10 || secret.length > 128) throw new Error("Mật khẩu cần từ 10 đến 128 ký tự.");
  const passwordHash = await hashPassword(secret);
  try {
    const result = db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'user')")
      .run(safeName, safeEmail, passwordHash);
    return publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(result.lastInsertRowid));
  } catch (error) {
    if (String(error.code).includes("CONSTRAINT")) throw new Error("Email này đã được đăng ký.");
    throw error;
  }
}

export async function authenticateUser(email, password) {
  const safeEmail = String(email || "").trim().toLowerCase();
  const user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(safeEmail);
  if (!user) {
    // Keep an unknown account's failure path reasonably similar to a real hash check.
    await hashPassword("dummy-password-for-timing-only").catch(() => null);
    return null;
  }
  if (!await verifyPassword(String(password || ""), user.password_hash)) return null;
  return publicUser(user);
}

export function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  db.prepare("INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)")
    .run(hashToken(token), userId, now + SESSION_MS, now);
  // Periodically purge expired rows without a separate job.
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  writeCookie(res, token, Math.floor(SESSION_MS / 1000));
}

export function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token && /^[a-f0-9]{64}$/i.test(token)) {
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hashToken(token));
  }
  writeCookie(res, "", 0);
}

export function loadCurrentUser(req, res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token && /^[a-f0-9]{64}$/i.test(token)) {
      const session = db.prepare(`
        SELECT u.id,u.name,u.email,u.role,u.admin_level,u.created_at,s.expires_at
        FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=?
      `).get(hashToken(token));
      if (session && session.expires_at > Date.now()) {
        req.user = publicUser(session);
        req.sessionTokenHash = hashToken(token);
      } else if (session) {
        db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hashToken(token));
        writeCookie(res, "", 0);
      }
    }
    next();
  } catch (error) { next(error); }
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Vui lòng đăng nhập để tiếp tục." });
  next();
}
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Vui lòng đăng nhập." });
  if (req.user.role !== "admin" || Number(req.user.adminLevel) < 1) return res.status(403).json({ error: "Tài khoản Admin này chưa được Admin cao nhất cấp quyền." });
  next();
}

export function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Vui lòng đăng nhập." });
  if (req.user.role !== "admin" || Number(req.user.adminLevel) < 2) {
    return res.status(403).json({ error: "Chỉ Admin cấp cao nhất mới có quyền thực hiện thao tác này." });
  }
  next();
}

export async function createInitialAdmin() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const name = String(process.env.ADMIN_NAME || "MAI HỌC Admin").trim();
  if (!email && !password) return;
  if (!email || !password) throw new Error("Cần cấu hình cả ADMIN_EMAIL và ADMIN_PASSWORD để tạo Admin ban đầu.");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD cần có ít nhất 12 ký tự.");
  const existing = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email);
  if (existing) {
    db.prepare("UPDATE users SET role='admin', admin_level=2 WHERE id=?").run(existing.id);
    return;
  }
  const passwordHash = await hashPassword(password);
  db.prepare("INSERT INTO users (name,email,password_hash,role,admin_level) VALUES (?,?,?,'admin',2)").run(name, email, passwordHash);
  console.log("Đã tạo tài khoản Admin ban đầu từ cấu hình môi trường.");
}

export function requireSameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (origin) {
    const expected = process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get("host")}`;
    if (origin !== expected) return res.status(403).json({ error: "Yêu cầu không cùng nguồn gốc." });
  }
  next();
}
