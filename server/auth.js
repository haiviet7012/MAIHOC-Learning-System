import crypto from "node:crypto";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// Load env before dynamically opening PostgreSQL (ESM imports execute before server.js body).
const scrypt = promisify(crypto.scrypt);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
dotenv.config();

const configuredAuthBackend = String(
  process.env.MAIHOC_AUTH_BACKEND || (process.env.DATABASE_URL ? "postgres" : "sqlite")
).trim().toLowerCase();
if (!["postgres", "sqlite"].includes(configuredAuthBackend)) {
  throw new Error("MAIHOC_AUTH_BACKEND chỉ nhận postgres hoặc sqlite.");
}
if (configuredAuthBackend === "postgres" && !process.env.DATABASE_URL) {
  throw new Error("MAIHOC_AUTH_BACKEND=postgres nhưng thiếu DATABASE_URL.");
}
const postgresModule = configuredAuthBackend === "postgres" ? await import("./postgres.js") : null;
const postgresPool = postgresModule?.pool || null;
export const authUsesPostgres = Boolean(postgresPool);
export const authPool = postgresPool;

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "maihoc.sqlite"));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('temp_store = MEMORY');
db.pragma('cache_size = -64000'); // Cấp 64MB bộ nhớ đệm RAM cho SQLite
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
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS password_reset_expiry_idx ON password_reset_tokens(expires_at,user_id);
  CREATE TABLE IF NOT EXISTS email_verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL COLLATE NOCASE,
    purpose TEXT NOT NULL,
    target_email TEXT,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS email_verification_user_idx ON email_verification_codes(user_id, purpose, expires_at);
  CREATE TABLE IF NOT EXISTS user_presence (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_seen_at INTEGER NOT NULL,
    activity TEXT NOT NULL DEFAULT 'Đang trực tuyến'
  );
  CREATE INDEX IF NOT EXISTS user_presence_last_seen_idx ON user_presence(last_seen_at);
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
  CREATE TABLE IF NOT EXISTS exam_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    grade TEXT NOT NULL,
    category TEXT NOT NULL,
    graded INTEGER NOT NULL DEFAULT 0 CHECK(graded IN (0,1)),
    score REAL,
    scale REAL,
    percent INTEGER,
    correct_count INTEGER,
    question_count INTEGER,
    answers_json TEXT NOT NULL,
    answer_key_json TEXT,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS exam_attempts_user_created_idx ON exam_attempts(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS exam_attempts_document_idx ON exam_attempts(user_id, document_id, id DESC);
  CREATE TABLE IF NOT EXISTS document_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL, grade TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL,
    filename TEXT NOT NULL, original_name TEXT NOT NULL, size INTEGER NOT NULL,
    file_data BLOB,
    r2_key TEXT,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    answer_key_data BLOB,
    answer_key_r2_key TEXT,
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
    file_data BLOB,
    r2_key TEXT,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS answer_keys (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    file_data BLOB,
    r2_key TEXT,
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
  CREATE TABLE IF NOT EXISTS ai_solution_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    mode TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'text',
    title TEXT NOT NULL,
    model_used TEXT,
    r2_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS ai_solution_history_user_created_idx
    ON ai_solution_history(user_id, created_at DESC, id DESC);
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

const presenceColumns = new Set(db.pragma("table_info(user_presence)").map((column) => column.name));
if (!presenceColumns.has("activity")) {
  db.exec("ALTER TABLE user_presence ADD COLUMN activity TEXT NOT NULL DEFAULT 'Đang trực tuyến'");
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

// Add R2 object-key columns to existing SQLite databases without dropping legacy BLOBs.
for (const [tableName, columnName] of [
  ["documents", "r2_key"],
  ["document_submissions", "r2_key"],
  ["document_submissions", "answer_key_r2_key"],
  ["answer_keys", "r2_key"]
]) {
  const columns = new Set(db.pragma(`table_info(${tableName})`).map((column) => column.name));
  if (!columns.has(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} TEXT`);
  }
}

// Backward-compatible R2 columns for databases created before object storage.
for (const [tableName,columnName] of [["documents","r2_key"],["document_submissions","r2_key"],["document_submissions","answer_key_r2_key"],["answer_keys","r2_key"]]) {
  const columns = new Set(db.pragma(`table_info(${tableName})`).map(c=>c.name));
  if (!columns.has(columnName)) db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} TEXT`);
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
  res.setHeader("Set-Cookie", SESSION_COOKIE + "=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + maxAgeSeconds + secure);
}

function mirrorUserRow(user) {
  if (!user || user.id == null) throw new Error("Không thể đồng bộ tài khoản rỗng vào SQLite mirror.");
  db.prepare(
    "INSERT INTO users(id,name,email,password_hash,role,admin_level,created_at) " +
    "VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET " +
    "name=excluded.name,email=excluded.email,password_hash=excluded.password_hash," +
    "role=excluded.role,admin_level=excluded.admin_level,created_at=excluded.created_at"
  ).run(
    Number(user.id), String(user.name || ""), String(user.email || ""),
    String(user.password_hash || ""), String(user.role || "user"),
    Number(user.admin_level || 0), String(user.created_at || new Date().toISOString())
  );
  return user;
}

async function initializePostgresAuth() {
  const requiredTables = ["users", "sessions", "user_presence", "email_verification_codes"];
  const result = await postgresPool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])",
    [requiredTables]
  );
  const existing = new Set(result.rows.map((row) => row.table_name));
  const missing = requiredTables.filter((table) => !existing.has(table));
  if (missing.length) {
    throw new Error(
      "PostgreSQL chưa được nhập schema/dữ liệu MAI HỌC. Thiếu bảng: " + missing.join(", ") +
      ". Hãy chạy migrate-sqlite-to-postgres.js sau khi kiểm tra báo cáo trước khi bật MAIHOC_AUTH_BACKEND=postgres."
    );
  }

  const usersResult = await postgresPool.query(
    "SELECT id,name,email,password_hash,role,admin_level,created_at FROM users ORDER BY id"
  );
  const sessionsResult = await postgresPool.query(
    "SELECT token_hash,user_id,expires_at,created_at FROM sessions WHERE expires_at > $1",
    [Date.now()]
  );
  const presenceResult = await postgresPool.query(
    "SELECT user_id,last_seen_at,activity FROM user_presence"
  );

  const sync = db.transaction(() => {
    for (const user of usersResult.rows) mirrorUserRow(user);
    // PostgreSQL is authoritative for sessions. Chat still reads the local mirror.
    db.prepare("DELETE FROM sessions").run();
    const insertSession = db.prepare(
      "INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)"
    );
    for (const session of sessionsResult.rows) {
      insertSession.run(String(session.token_hash), Number(session.user_id), Number(session.expires_at), Number(session.created_at));
    }
    db.prepare("DELETE FROM user_presence").run();
    const insertPresence = db.prepare(
      "INSERT OR REPLACE INTO user_presence(user_id,last_seen_at,activity) VALUES(?,?,?)"
    );
    for (const item of presenceResult.rows) {
      insertPresence.run(Number(item.user_id), Number(item.last_seen_at), String(item.activity || "Đang trực tuyến"));
    }
  });
  sync();
  console.info("[Auth] PostgreSQL is authoritative; synchronized " + usersResult.rows.length + " user(s) to the legacy SQLite mirror.");
  return true;
}

export const authReady = authUsesPostgres ? initializePostgresAuth() : Promise.resolve(true);
authReady.catch(() => {});

export function publicUser(user) {
  if (!user) return null;
  return {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    adminLevel: Number(user.admin_level || 0),
    createdAt: user.created_at
  };
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return "scrypt$" + salt + "$" + Buffer.from(derived).toString("hex");
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

export async function findUserByEmail(email) {
  await authReady;
  const safeEmail = String(email || "").trim().toLowerCase();
  if (authUsesPostgres) {
    const result = await postgresPool.query("SELECT * FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1", [safeEmail]);
    if (result.rows[0]) mirrorUserRow(result.rows[0]);
    return result.rows[0] || null;
  }
  return db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(safeEmail) || null;
}

export async function findUserById(id) {
  await authReady;
  if (authUsesPostgres) {
    const result = await postgresPool.query("SELECT * FROM users WHERE id=$1 LIMIT 1", [Number(id)]);
    if (result.rows[0]) mirrorUserRow(result.rows[0]);
    return result.rows[0] || null;
  }
  return db.prepare("SELECT * FROM users WHERE id=?").get(Number(id)) || null;
}

export async function createUserAccount({ name, email, passwordHash, role = "user", adminLevel = 0 }) {
  await authReady;
  const safeName = String(name || "").trim();
  const safeEmail = String(email || "").trim().toLowerCase();
  if (authUsesPostgres) {
    try {
      const result = await postgresPool.query(
        "INSERT INTO users(name,email,password_hash,role,admin_level) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [safeName, safeEmail, String(passwordHash), String(role), Number(adminLevel)]
      );
      const row = result.rows[0];
      try {
        mirrorUserRow(row);
      } catch (mirrorError) {
        await postgresPool.query("DELETE FROM users WHERE id=$1", [row.id]).catch(() => {});
        throw mirrorError;
      }
      return row;
    } catch (error) {
      if (error.code === "23505" || String(error.code || "").includes("CONSTRAINT")) {
        throw new Error("Email này đã được đăng ký.");
      }
      throw error;
    }
  }
  const result = db.prepare(
    "INSERT INTO users(name,email,password_hash,role,admin_level) VALUES(?,?,?,?,?)"
  ).run(safeName, safeEmail, String(passwordHash), String(role), Number(adminLevel));
  return db.prepare("SELECT * FROM users WHERE id=?").get(result.lastInsertRowid);
}

const ACCOUNT_COLUMNS = Object.freeze({
  name: "name",
  email: "email",
  passwordHash: "password_hash",
  role: "role",
  adminLevel: "admin_level"
});

export async function updateUserAccount(id, changes) {
  await authReady;
  const entries = Object.entries(changes || {}).filter(([key, value]) =>
    Object.hasOwn(ACCOUNT_COLUMNS, key) && value !== undefined
  );
  if (!entries.length) return findUserById(id);

  if (authUsesPostgres) {
    const originalResult = await postgresPool.query("SELECT * FROM users WHERE id=$1", [Number(id)]);
    const original = originalResult.rows[0];
    if (!original) return null;
    const values = entries.map(([, value]) => value);
    values.push(Number(id));
    const assignments = entries.map(([key], index) => ACCOUNT_COLUMNS[key] + "=$" + (index + 1)).join(", ");
    const updatedResult = await postgresPool.query(
      "UPDATE users SET " + assignments + " WHERE id=$" + values.length + " RETURNING *",
      values
    );
    const updated = updatedResult.rows[0];
    try {
      mirrorUserRow(updated);
    } catch (mirrorError) {
      await postgresPool.query(
        "UPDATE users SET name=$1,email=$2,password_hash=$3,role=$4,admin_level=$5,created_at=$6 WHERE id=$7",
        [original.name, original.email, original.password_hash, original.role, original.admin_level, original.created_at, original.id]
      ).catch(() => {});
      throw mirrorError;
    }
    return updated;
  }

  const values = entries.map(([, value]) => value);
  const assignments = entries.map(([key]) => ACCOUNT_COLUMNS[key] + "=?").join(", ");
  db.prepare("UPDATE users SET " + assignments + " WHERE id=?").run(...values, Number(id));
  return db.prepare("SELECT * FROM users WHERE id=?").get(Number(id)) || null;
}

export async function deleteUserAccount(id) {
  await authReady;
  const userId = Number(id);
  if (!Number.isSafeInteger(userId) || userId < 1) return false;

  db.exec("BEGIN IMMEDIATE");
  let pgClient = null;
  let pgTransaction = false;
  try {
    const localResult = db.prepare("DELETE FROM users WHERE id=?").run(userId);
    if (!localResult.changes) {
      db.exec("ROLLBACK");
      return false;
    }
    if (authUsesPostgres) {
      pgClient = await postgresPool.connect();
      await pgClient.query("BEGIN");
      pgTransaction = true;
      const deleted = await pgClient.query("DELETE FROM users WHERE id=$1 RETURNING id", [userId]);
      if (!deleted.rowCount) throw new Error("Không tìm thấy tài khoản trong PostgreSQL.");
      await pgClient.query("COMMIT");
      pgTransaction = false;
    }
    db.exec("COMMIT");
    return true;
  } catch (error) {
    if (pgTransaction && pgClient) await pgClient.query("ROLLBACK").catch(() => {});
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  } finally {
    pgClient?.release();
  }
}

export async function revokeUserSessions(userId) {
  await authReady;
  const id = Number(userId);
  if (authUsesPostgres) await postgresPool.query("DELETE FROM sessions WHERE user_id=$1", [id]);
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
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
    return publicUser(await createUserAccount({ name: safeName, email: safeEmail, passwordHash, role: "user", adminLevel: 0 }));
  } catch (error) {
    if (error.code === "23505" || /đã được đăng ký/i.test(String(error.message))) {
      throw new Error("Email này đã được đăng ký.");
    }
    throw error;
  }
}

export async function authenticateUser(email, password) {
  const user = await findUserByEmail(email);
  if (!user) {
    await hashPassword("dummy-password-for-timing-only").catch(() => null);
    return null;
  }
  if (!await verifyPassword(String(password || ""), user.password_hash)) return null;
  return publicUser(user);
}

export async function createSession(userId, res) {
  await authReady;
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const now = Date.now();
  if (authUsesPostgres) {
    await postgresPool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES($1,$2,$3,$4)",
      [tokenHash, Number(userId), now + SESSION_MS, now]
    );
  }
  try {
    db.prepare("INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)")
      .run(tokenHash, Number(userId), now + SESSION_MS, now);
    db.prepare("INSERT INTO user_presence(user_id,last_seen_at,activity) VALUES(?,?,'Đang trực tuyến') ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,activity='Đang trực tuyến'")
      .run(Number(userId), now);
  } catch (error) {
    if (authUsesPostgres) await postgresPool.query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash]).catch(() => {});
    throw error;
  }
  if (authUsesPostgres) {
    await postgresPool.query(
      "INSERT INTO user_presence(user_id,last_seen_at,activity) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at,activity=EXCLUDED.activity",
      [Number(userId), now, "Đang trực tuyến"]
    );
    await postgresPool.query("DELETE FROM sessions WHERE expires_at < $1", [now]);
  }
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  writeCookie(res, token, Math.floor(SESSION_MS / 1000));
}

export async function destroySession(req, res) {
  await authReady;
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token && /^[a-f0-9]{64}$/i.test(token)) {
    const tokenHash = hashToken(token);
    if (authUsesPostgres) await postgresPool.query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash]);
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash);
  }
  if (req.user?.id) {
    const now = Date.now();
    if (authUsesPostgres) {
      const remaining = await postgresPool.query(
        "SELECT COUNT(*)::bigint AS count FROM sessions WHERE user_id=$1 AND expires_at>$2",
        [Number(req.user.id), now]
      );
      if (!Number(remaining.rows[0]?.count)) {
        await postgresPool.query("DELETE FROM user_presence WHERE user_id=$1", [Number(req.user.id)]);
        db.prepare("DELETE FROM user_presence WHERE user_id=?").run(Number(req.user.id));
      } else {
        await postgresPool.query("UPDATE user_presence SET last_seen_at=$1 WHERE user_id=$2", [now, Number(req.user.id)]);
        db.prepare("UPDATE user_presence SET last_seen_at=? WHERE user_id=?").run(now, Number(req.user.id));
      }
    } else {
      const remaining = db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id=? AND expires_at>?").get(req.user.id, now);
      if (!Number(remaining?.count)) db.prepare("DELETE FROM user_presence WHERE user_id=?").run(req.user.id);
      else db.prepare("UPDATE user_presence SET last_seen_at=? WHERE user_id=?").run(now, req.user.id);
    }
  }
  writeCookie(res, "", 0);
}

const presenceUpdateCache = new Map();
const PRESENCE_WRITE_INTERVAL_MS = 60 * 1000;
export async function loadCurrentUser(req, res, next) {
  try {
    await authReady;
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token && /^[a-f0-9]{64}$/i.test(token)) {
      const tokenHash = hashToken(token);
      let session;
      if (authUsesPostgres) {
        const result = await postgresPool.query(
          "SELECT u.id,u.name,u.email,u.role,u.admin_level,u.created_at,s.expires_at " +
          "FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1",
          [tokenHash]
        );
        session = result.rows[0] || null;
      } else {
        session = db.prepare(
          "SELECT u.id,u.name,u.email,u.role,u.admin_level,u.created_at,s.expires_at " +
          "FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?"
        ).get(tokenHash);
      }

      if (session && Number(session.expires_at) > Date.now()) {
        req.user = publicUser(session);
        req.sessionTokenHash = tokenHash;

        const nowMs = Date.now();
        const currentUserId = req.user.id;
        const lastUpdateMs = presenceUpdateCache.get(currentUserId) || 0;
        if (nowMs - lastUpdateMs >= PRESENCE_WRITE_INTERVAL_MS) {
          presenceUpdateCache.set(currentUserId, nowMs);
          if (authUsesPostgres) {
            await postgresPool.query(
              "INSERT INTO user_presence(user_id,last_seen_at,activity) VALUES($1,$2,$3) " +
              "ON CONFLICT(user_id) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at",
              [currentUserId, nowMs, "Đang trực tuyến"]
            );
          }
          try {
            db.prepare(
              "INSERT INTO user_presence(user_id,last_seen_at) VALUES(?,?) " +
              "ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at"
            ).run(currentUserId, nowMs);
          } catch {}
        }
      } else if (session) {
        if (authUsesPostgres) await postgresPool.query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash]);
        db.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash);
        writeCookie(res, "", 0);
      }
    }
    next();
  } catch (error) {
    next(error);
  }
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
  await authReady;
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const name = String(process.env.ADMIN_NAME || "MAI HỌC Admin").trim();
  if (!email && !password) return;
  if (!email || !password) throw new Error("Cần cấu hình cả ADMIN_EMAIL và ADMIN_PASSWORD để tạo Admin ban đầu.");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD cần có ít nhất 12 ký tự.");

  const existing = await findUserByEmail(email);
  if (existing) {
    if (existing.role !== "admin" || Number(existing.admin_level || 0) < 2) {
      await updateUserAccount(existing.id, { role: "admin", adminLevel: 2 });
    }
    return;
  }
  const passwordHash = await hashPassword(password);
  await createUserAccount({ name, email, passwordHash, role: "admin", adminLevel: 2 });
  console.log("Đã tạo tài khoản Admin ban đầu từ cấu hình môi trường.");
}

export function requireSameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (origin) {
    const proto = req.get("x-forwarded-proto") || req.protocol;
    const host = req.get("x-forwarded-host") || req.get("host");
    const dynamicOrigin = proto + "://" + host;
    const expected = process.env.PUBLIC_ORIGIN;
    
    if (expected && origin === expected) return next();
    if (origin === dynamicOrigin) return next();

    // Hỗ trợ reverse proxy (Render, Cloudflare) khi protocol chuyển tiếp giữa http và https
    try {
      const originHost = new URL(origin).host;
      if (originHost && originHost === host) return next();
    } catch {}

    return res.status(403).json({ error: "Yêu cầu không cùng nguồn gốc." });
  }
  next();
}
