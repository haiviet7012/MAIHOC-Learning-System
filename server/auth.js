import crypto from "node:crypto";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// const db = require('./db'); // Nạp kết nối SQLite từ file db.js cùng thư mục
const scrypt = promisify(crypto.scrypt);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
dotenv.config();

const AUTH_STORAGE = String(process.env.AUTH_STORAGE || "sqlite").trim().toLowerCase();
if (!["sqlite", "postgres"].includes(AUTH_STORAGE)) {
  throw new Error("AUTH_STORAGE must be either sqlite or postgres.");
}
export const isPostgresAuthEnabled = AUTH_STORAGE === "postgres";
let authPgPool = null;

if (isPostgresAuthEnabled) {
  if (!process.env.DATABASE_URL) {
    throw new Error("AUTH_STORAGE=postgres requires DATABASE_URL.");
  }
  const postgres = await import("./postgres.js");
  authPgPool = postgres.pool;
  const requiredTables = ["users", "sessions", "user_presence"];
  const schemaResult = await authPgPool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name = ANY($1::text[])",
    [requiredTables]
  );
  const present = new Set(schemaResult.rows.map((row) => row.table_name));
  const missing = requiredTables.filter((name) => !present.has(name));
  if (missing.length) {
    await authPgPool.end();
    throw new Error(
      "AUTH_STORAGE=postgres but the imported schema is incomplete. Missing tables: " + missing.join(", ") +
      ". Import and verify the SQLite data before enabling PostgreSQL auth."
    );
  }
}

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
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
}

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

function mirrorUserToSqlite(user) {
  if (!user) throw new Error("Cannot mirror an empty PostgreSQL user.");
  db.prepare(`
    INSERT INTO users (id,name,email,password_hash,role,admin_level,created_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      email=excluded.email,
      password_hash=excluded.password_hash,
      role=excluded.role,
      admin_level=excluded.admin_level,
      created_at=excluded.created_at
  `).run(
    Number(user.id),
    String(user.name),
    String(user.email).trim().toLowerCase(),
    String(user.password_hash),
    String(user.role || "user"),
    Number(user.admin_level || 0),
    String(user.created_at || new Date().toISOString())
  );
}

export async function syncPostgresUserFromSqlite(userId) {
  if (!isPostgresAuthEnabled) return;
  const user = db.prepare(
    "SELECT id,name,email,password_hash,role,admin_level,created_at FROM users WHERE id=?"
  ).get(Number(userId));
  if (!user) return;
  const client = await authPgPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      INSERT INTO users (id,name,email,password_hash,role,admin_level,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(id) DO UPDATE SET
        name=EXCLUDED.name,
        email=EXCLUDED.email,
        password_hash=EXCLUDED.password_hash,
        role=EXCLUDED.role,
        admin_level=EXCLUDED.admin_level,
        created_at=EXCLUDED.created_at
    `, [
      Number(user.id), user.name, String(user.email).trim().toLowerCase(),
      user.password_hash, user.role, Number(user.admin_level || 0), user.created_at
    ]);
    // Preserve safe generated IDs if an account was created by a legacy admin route.
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('users','id'),
        GREATEST((SELECT COALESCE(MAX(id),1) FROM users),1),
        true
      )
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function deletePostgresUser(userId) {
  if (!isPostgresAuthEnabled) return;
  await authPgPool.query("DELETE FROM users WHERE id=$1", [Number(userId)]);
}

export async function deletePostgresSessionsForUser(userId) {
  if (!isPostgresAuthEnabled) return;
  await authPgPool.query("DELETE FROM sessions WHERE user_id=$1", [Number(userId)]);
}

export async function queryPostgresAuth(sql, params = []) {
  if (!isPostgresAuthEnabled) {
    throw new Error("queryPostgresAuth is only available when AUTH_STORAGE=postgres.");
  }
  return authPgPool.query(sql, params);
}

async function findPostgresUserById(userId) {
  const result = await authPgPool.query(
    "SELECT id,name,email,password_hash,role,admin_level,created_at FROM users WHERE id=$1",
    [Number(userId)]
  );
  return result.rows[0] || null;
}

export async function initializePostgresAuthCompatibilityMirror() {
  if (!isPostgresAuthEnabled) return { enabled: false };

  const pgUsers = (await authPgPool.query(
    "SELECT id,name,email,password_hash,role,admin_level,created_at FROM users ORDER BY id"
  )).rows;
  const sqliteUsers = db.prepare("SELECT id FROM users ORDER BY id").all();
  const pgIds = new Set(pgUsers.map((user) => Number(user.id)));
  const sqliteIds = new Set(sqliteUsers.map((user) => Number(user.id)));
  const sqliteOnlyIds = [...sqliteIds].filter((id) => !pgIds.has(id));
  if (sqliteOnlyIds.length) {
    throw new Error(
      "PostgreSQL auth cutover stopped: SQLite contains user IDs absent from PostgreSQL (" +
      sqliteOnlyIds.slice(0, 20).join(", ") +
      "). Stop writes and reconcile/re-import the account snapshot before enabling AUTH_STORAGE=postgres."
    );
  }

  // Keep legacy joins (chat, notifications and account dashboards) on a consistent mirror.
  for (const user of pgUsers) mirrorUserToSqlite(user);

  const pgSessions = (await authPgPool.query(
    "SELECT token_hash,user_id,expires_at,created_at FROM sessions WHERE expires_at > $1 ORDER BY created_at",
    [Date.now()]
  )).rows;
  db.exec("DELETE FROM sessions");
  const insertSession = db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)"
  );
  for (const session of pgSessions) {
    insertSession.run(
      session.token_hash, Number(session.user_id), Number(session.expires_at), Number(session.created_at)
    );
  }

  const pgPresence = (await authPgPool.query(
    "SELECT user_id,last_seen_at,activity FROM user_presence"
  )).rows;
  db.exec("DELETE FROM user_presence");
  const insertPresence = db.prepare(
    "INSERT INTO user_presence(user_id,last_seen_at,activity) VALUES(?,?,?)"
  );
  for (const presence of pgPresence) {
    insertPresence.run(
      Number(presence.user_id), Number(presence.last_seen_at), presence.activity || "Đang trực tuyến"
    );
  }
  return { enabled: true, users: pgUsers.length, sessions: pgSessions.length };
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
  if (isPostgresAuthEnabled) {
    const client = await authPgPool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "INSERT INTO users (name,email,password_hash,role,admin_level) VALUES ($1,$2,$3,'user',0) RETURNING *",
        [safeName, safeEmail, passwordHash]
      );
      const user = result.rows[0];
      // Keep the SQLite account mirror for older modules that still join against users.
      mirrorUserToSqlite(user);
      await client.query("COMMIT");
      return publicUser(user);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error.code === "23505" || String(error.code || "").includes("CONSTRAINT")) {
        throw new Error("Email này đã được đăng ký.");
      }
      throw error;
    } finally {
      client.release();
    }
  }
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
  const user = isPostgresAuthEnabled
    ? (await authPgPool.query(
        "SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1",
        [safeEmail]
      )).rows[0]
    : db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(safeEmail);
  if (!user) {
    await hashPassword("dummy-password-for-timing-only").catch(() => null);
    return null;
  }
  if (!await verifyPassword(String(password || ""), user.password_hash)) return null;
  return publicUser(user);
}

export async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const now = Date.now();
  const expiresAt = now + SESSION_MS;
  if (isPostgresAuthEnabled) {
    const client = await authPgPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES ($1,$2,$3,$4)",
        [tokenHash, Number(userId), expiresAt, now]
      );
      await client.query(
        "INSERT INTO user_presence(user_id,last_seen_at,activity) VALUES($1,$2,'Đang trực tuyến') ON CONFLICT(user_id) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at,activity='Đang trực tuyến'",
        [Number(userId), now]
      );
      // Chat and the remaining legacy modules currently validate sessions through SQLite.
      db.prepare("INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)")
        .run(tokenHash, Number(userId), expiresAt, now);
      db.prepare("INSERT INTO user_presence(user_id,last_seen_at,activity) VALUES(?,?,'Đang trực tuyến') ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,activity='Đang trực tuyến'")
        .run(Number(userId), now);
      db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
      await client.query("DELETE FROM sessions WHERE expires_at < $1", [now]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash);
      throw error;
    } finally {
      client.release();
    }
  } else {
    db.prepare("INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)")
      .run(tokenHash, Number(userId), expiresAt, now);
    db.prepare("INSERT INTO user_presence(user_id,last_seen_at,activity) VALUES(?,?,'Đang trực tuyến') ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at").run(Number(userId), now);
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  }
  writeCookie(res, token, Math.floor(SESSION_MS / 1000));
}

export async function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token && /^[a-f0-9]{64}$/i.test(token)) {
    const tokenHash = hashToken(token);
    if (isPostgresAuthEnabled) {
      await authPgPool.query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash]);
    }
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash);
  }
  if (req.user?.id) {
    const now = Date.now();
    const remaining = isPostgresAuthEnabled
      ? Number((await authPgPool.query(
          "SELECT COUNT(*)::int AS count FROM sessions WHERE user_id=$1 AND expires_at>$2",
          [Number(req.user.id), now]
        )).rows[0]?.count || 0)
      : Number(db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id=? AND expires_at>?").get(Number(req.user.id), now)?.count || 0);
    if (!remaining) {
      if (isPostgresAuthEnabled) await authPgPool.query("DELETE FROM user_presence WHERE user_id=$1", [Number(req.user.id)]);
      db.prepare("DELETE FROM user_presence WHERE user_id=?").run(Number(req.user.id));
    } else {
      if (isPostgresAuthEnabled) await authPgPool.query("UPDATE user_presence SET last_seen_at=$1 WHERE user_id=$2", [now, Number(req.user.id)]);
      db.prepare("UPDATE user_presence SET last_seen_at=? WHERE user_id=?").run(now, Number(req.user.id));
    }
  }
  writeCookie(res, "", 0);
}


const presenceUpdateCache = new Map(); // Lưu thời điểm ghi DB gần nhất của từng userId
const PRESENCE_WRITE_INTERVAL_MS = 60 * 1000; // Chỉ ghi xuống SQLite tối đa 1 lần / 60 giây cho mỗi user
export async function loadCurrentUser(req, res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token && /^[a-f0-9]{64}$/i.test(token)) {
      const tokenHash = hashToken(token);
      const session = isPostgresAuthEnabled
        ? (await authPgPool.query(`
            SELECT u.id,u.name,u.email,u.role,u.admin_level,u.created_at,s.expires_at
            FROM sessions s JOIN users u ON u.id=s.user_id
            WHERE s.token_hash=$1
            LIMIT 1
          `, [tokenHash])).rows[0]
        : db.prepare(`
            SELECT u.id,u.name,u.email,u.role,u.admin_level,u.created_at,s.expires_at
            FROM sessions s JOIN users u ON u.id=s.user_id
            WHERE s.token_hash=?
          `).get(tokenHash);
      const expiresAt = Number(session?.expires_at);
      if (session && expiresAt > Date.now()) {
        req.user = publicUser(session);
        req.sessionTokenHash = tokenHash;

        const nowMs = Date.now();
        const currentUserId = req.user.id;
        const lastUpdateMs = presenceUpdateCache.get(currentUserId) || 0;

        if (nowMs - lastUpdateMs >= PRESENCE_WRITE_INTERVAL_MS) {
          presenceUpdateCache.set(currentUserId, nowMs);
          try {
            if (isPostgresAuthEnabled) {
              await authPgPool.query(`
                INSERT INTO user_presence (user_id, last_seen_at)
                VALUES ($1,$2)
                ON CONFLICT(user_id) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at
              `, [currentUserId, nowMs]);
            }
            db.prepare(`
              INSERT INTO user_presence (user_id, last_seen_at)
              VALUES (?, ?)
              ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at
            `).run(currentUserId, nowMs);
          } catch (presenceErr) {
            // Presence updates are best-effort and must not fail authenticated requests.
          }
        }
      } else if (session) {
        if (isPostgresAuthEnabled) await authPgPool.query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash]);
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
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const name = String(process.env.ADMIN_NAME || "MAI HỌC Admin").trim();
  if (!email && !password) return;
  if (!email || !password) throw new Error("Cần cấu hình cả ADMIN_EMAIL và ADMIN_PASSWORD để tạo Admin ban đầu.");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD cần có ít nhất 12 ký tự.");

  if (isPostgresAuthEnabled) {
    const existing = (await authPgPool.query(
      "SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1",
      [email]
    )).rows[0];
    if (existing) {
      await authPgPool.query("UPDATE users SET role='admin',admin_level=2 WHERE id=$1", [Number(existing.id)]);
      mirrorUserToSqlite(await findPostgresUserById(existing.id));
      return;
    }
    const passwordHash = await hashPassword(password);
    const created = (await authPgPool.query(
      "INSERT INTO users (name,email,password_hash,role,admin_level) VALUES ($1,$2,$3,'admin',2) RETURNING *",
      [name, email, passwordHash]
    )).rows[0];
    mirrorUserToSqlite(created);
    console.log("Đã tạo tài khoản Admin ban đầu trong PostgreSQL từ cấu hình môi trường.");
    return;
  }

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
