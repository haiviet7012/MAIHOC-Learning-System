import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFileFallback(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch {}
}

try {
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: path.join(__dirname, ".env"), override: true });
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
  dotenv.config();
} catch {
  loadEnvFileFallback(path.join(__dirname, ".env"));
  loadEnvFileFallback(path.resolve(__dirname, "..", ".env"));
}

let Pool = null;
let types = null;
try {
  const pgMod = await import("pg");
  const pg = pgMod.default || pgMod;
  Pool = pg.Pool;
  types = pg.types;
} catch {
  // pg will be resolved when installed via npm install or mocked via setTestPool()
}

// Parse PostgreSQL BIGINT (OID 20) into JS Number when within safe integer range
// so IDs, counts, and epoch millisecond timestamps behave identically to SQLite.
if (types && typeof types.setTypeParser === "function") {
  types.setTypeParser(20, (val) => {
    if (val === null || val === undefined) return null;
    const num = Number(val);
    return Number.isSafeInteger(num) ? num : val;
  });
  types.setTypeParser(1700, (val) => {
    if (val === null || val === undefined) return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : val;
  });
}

function buildSslConfig(connectionString = "") {
  const sslEnv = String(process.env.DATABASE_SSL || process.env.PGSSLMODE || "").trim().toLowerCase();
  if (sslEnv === "false" || sslEnv === "disable" || sslEnv === "0") {
    return false;
  }
  if (
    sslEnv === "true" ||
    sslEnv === "require" ||
    sslEnv === "1" ||
    /sslmode=(require|verify-ca|verify-full)/i.test(connectionString) ||
    /\.render\.com|\.neon\.tech|\.supabase\.co|\.supabase\.com|\.railway\.app/i.test(connectionString)
  ) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function createPgPool() {
  if (globalThis.__MAIHOC_TEST_PG_POOL__) {
    return globalThis.__MAIHOC_TEST_PG_POOL__;
  }
  const connectionString = String(process.env.DATABASE_URL || "").trim();
  if (!connectionString) {
    return null;
  }
  if (!Pool) {
    throw new Error("Chưa cài đặt gói 'pg'. Hãy chạy 'npm install' trong thư mục server.");
  }
  const ssl = buildSslConfig(connectionString);
  const pgPool = new Pool({
    connectionString,
    ...(ssl !== undefined ? { ssl } : {}),
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  pgPool.on("error", (error) => {
    console.error("Lỗi kết nối PostgreSQL:", error.message);
  });
  return pgPool;
}

let activePool = createPgPool();

export function getActivePool() {
  if (globalThis.__MAIHOC_TEST_PG_POOL__) {
    return globalThis.__MAIHOC_TEST_PG_POOL__;
  }
  if (!activePool) {
    activePool = createPgPool();
  }
  if (!activePool) {
    throw new Error("Thiếu biến môi trường DATABASE_URL");
  }
  return activePool;
}

export function setTestPool(customPool) {
  globalThis.__MAIHOC_TEST_PG_POOL__ = customPool;
  activePool = customPool;
}

export const pool = new Proxy(
  {},
  {
    get(_target, prop) {
      const targetPool = getActivePool();
      const value = targetPool[prop];
      return typeof value === "function" ? value.bind(targetPool) : value;
    }
  }
);

export const TABLES_WITH_ID = new Set([
  "users",
  "password_reset_tokens",
  "email_verification_codes",
  "user_progress",
  "exam_attempts",
  "document_submissions",
  "documents",
  "exam_solution_reviews",
  "notifications",
  "ai_solution_history",
  "account_deletion_requests",
  "tests",
  "test_submissions",
  "chat_conversations",
  "chat_messages",
  "learning_results"
]);

export const IDENTITY_TABLES = [
  "users",
  "password_reset_tokens",
  "email_verification_codes",
  "user_progress",
  "exam_attempts",
  "document_submissions",
  "exam_solution_reviews",
  "notifications",
  "ai_solution_history",
  "account_deletion_requests",
  "test_submissions",
  "chat_messages",
  "learning_results"
];

/**
 * Splits or transforms SQL outside single-quoted string literals and double-quoted identifiers.
 */
function transformOutsideQuotes(sql, transformer) {
  let result = "";
  let i = 0;
  let segmentStart = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      if (i > segmentStart) {
        result += transformer(sql.slice(segmentStart, i));
      }
      const quote = ch;
      const quoteStart = i;
      i++;
      while (i < len) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      result += sql.slice(quoteStart, i);
      segmentStart = i;
    } else if (ch === "-" && sql[i + 1] === "-") {
      if (i > segmentStart) {
        result += transformer(sql.slice(segmentStart, i));
      }
      const commentStart = i;
      i += 2;
      while (i < len && sql[i] !== "\n") i++;
      result += sql.slice(commentStart, i);
      segmentStart = i;
    } else {
      i++;
    }
  }
  if (segmentStart < len) {
    result += transformer(sql.slice(segmentStart));
  }
  return result;
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      current += ch;
      i++;
      while (i < len) {
        current += sql[i];
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            current += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
    } else if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      i++;
    } else {
      current += ch;
      i++;
    }
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function normalizeParamValue(value) {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function isNamedParamsObject(arg) {
  if (!arg || typeof arg !== "object") return false;
  if (Array.isArray(arg) || Buffer.isBuffer(arg) || arg instanceof Uint8Array || arg instanceof Date) {
    return false;
  }
  return Object.prototype.toString.call(arg) === "[object Object]";
}

/**
 * Translates SQLite-flavored SQL and parameter bindings into PostgreSQL-compatible SQL and values.
 */
export function translateSqlToPostgres(rawSql, rawArgs = [], options = {}) {
  const { isRun = false } = options;
  let sql = String(rawSql || "").trim();
  let hadInsertOrIgnore = false;

  sql = transformOutsideQuotes(sql, (chunk) => {
    let s = chunk;

    // 1. INSERT OR IGNORE INTO -> INSERT INTO (with ON CONFLICT DO NOTHING appended at end)
    if (/\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(s)) {
      hadInsertOrIgnore = true;
      s = s.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, "INSERT INTO");
    }

    // 2. COLLATE NOCASE patterns
    // e.g. email = ? COLLATE NOCASE -> LOWER(email) = LOWER(?)
    s = s.replace(
      /(\b[a-zA-Z_][a-zA-Z0-9_.]*)\s*=\s*(\?|\$[0-9]+|@[a-zA-Z_][a-zA-Z0-9_]*)\s+COLLATE\s+NOCASE\b/gi,
      "LOWER($1) = LOWER($2)"
    );
    // e.g. name LIKE ? COLLATE NOCASE -> LOWER(name) LIKE LOWER(?)
    s = s.replace(
      /(\b[a-zA-Z_][a-zA-Z0-9_.]*)\s+LIKE\s+(\?|\$[0-9]+|@[a-zA-Z_][a-zA-Z0-9_]*)\s+COLLATE\s+NOCASE\b/gi,
      "LOWER($1) LIKE LOWER($2)"
    );
    // e.g. ORDER BY name COLLATE NOCASE ASC -> ORDER BY LOWER(name) ASC
    s = s.replace(
      /\bORDER\s+BY\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+COLLATE\s+NOCASE\b/gi,
      "ORDER BY LOWER($1)"
    );
    // Strip any remaining COLLATE NOCASE
    s = s.replace(/\s+COLLATE\s+NOCASE\b/gi, "");

    // 3. Scalar MAX(a, b) with 2 arguments -> GREATEST(a, b)
    s = s.replace(
      /\bMAX\s*\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)/gi,
      "GREATEST($1, $2)"
    );

    // 4. Quote camelCase column aliases (e.g. AS adminLevel -> AS "adminLevel")
    // Only quote identifiers starting with a lowercase letter that contain uppercase letters,
    // avoiding SQL keywords like AS IDENTITY or CAST(x AS INTEGER).
    s = s.replace(/\bAS\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi, (match, alias) => {
      if (/^[a-z_][a-zA-Z0-9_]*[A-Z][a-zA-Z0-9_]*$/.test(alias)) {
        return `AS "${alias}"`;
      }
      return match;
    });

    return s;
  });

  // Replace datetime('now') (which contains single quotes around 'now')
  sql = sql.replace(
    /\bdatetime\s*\(\s*'now'\s*\)/gi,
    "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')"
  );

  // Safe integer cast for grade ordering
  sql = sql.replace(
    /CAST\s*\(\s*([a-zA-Z0-9_.]*grade)\s+AS\s+INTEGER\s*\)/gi,
    "CASE WHEN $1 ~ '^[0-9]+$' THEN CAST($1 AS INTEGER) ELSE 99 END"
  );

  // Unpack arguments
  let flatArgs = rawArgs;
  if (
    rawArgs.length === 1 &&
    Array.isArray(rawArgs[0]) &&
    !Buffer.isBuffer(rawArgs[0])
  ) {
    flatArgs = rawArgs[0];
  }

  const values = [];
  if (flatArgs.length === 1 && isNamedParamsObject(flatArgs[0]) && /@[a-zA-Z_][a-zA-Z0-9_]*/.test(sql)) {
    const namedObj = flatArgs[0];
    const indexByName = new Map();
    sql = transformOutsideQuotes(sql, (chunk) =>
      chunk.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, name) => {
        if (!indexByName.has(name)) {
          values.push(normalizeParamValue(namedObj[name]));
          indexByName.set(name, values.length);
        }
        return `$${indexByName.get(name)}`;
      })
    );
  } else {
    let paramIndex = 0;
    sql = transformOutsideQuotes(sql, (chunk) =>
      chunk.replace(/\?/g, () => {
        const val = normalizeParamValue(flatArgs[paramIndex]);
        paramIndex++;
        values.push(val);
        return `$${paramIndex}`;
      })
    );
    if (paramIndex === 0 && flatArgs.length > 0 && /\$1\b/.test(sql)) {
      for (const item of flatArgs) {
        values.push(normalizeParamValue(item));
      }
    }
  }

  // Strip trailing semicolon before appending ON CONFLICT / RETURNING
  sql = sql.replace(/;\s*$/, "");

  if (hadInsertOrIgnore && !/\bON\s+CONFLICT\b/i.test(sql)) {
    sql += " ON CONFLICT DO NOTHING";
  }

  if (isRun) {
    const insertMatch = /^\s*INSERT\s+INTO\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i.exec(sql);
    if (insertMatch) {
      const tableName = insertMatch[1].toLowerCase();
      if (TABLES_WITH_ID.has(tableName) && !/\bRETURNING\b/i.test(sql)) {
        sql += " RETURNING id";
      }
    }
  }

  return { sql, values };
}

function normalizePostgresError(error) {
  if (!error || typeof error !== "object") return error;
  const code = String(error.code || "");
  if (/^23/.test(code) && !code.includes("CONSTRAINT")) {
    error.pgCode = code;
    error.code = `SQLITE_CONSTRAINT_${code}`;
  }
  return error;
}

const txStorage = new AsyncLocalStorage();

export function createPostgresDb(poolGetter = getActivePool) {
  async function executeRaw(sql, values = []) {
    const store = txStorage.getStore();
    const runner = store ? store.client : poolGetter();
    try {
      if (values && values.length > 0) {
        return await runner.query(sql, values);
      }
      return await runner.query(sql);
    } catch (error) {
      throw normalizePostgresError(error);
    }
  }

  async function get(rawSql, ...args) {
    const { sql, values } = translateSqlToPostgres(rawSql, args, { isRun: false });
    const res = await executeRaw(sql, values);
    return res.rows[0] ?? undefined;
  }

  async function all(rawSql, ...args) {
    const { sql, values } = translateSqlToPostgres(rawSql, args, { isRun: false });
    const res = await executeRaw(sql, values);
    return res.rows || [];
  }

  async function run(rawSql, ...args) {
    const { sql, values } = translateSqlToPostgres(rawSql, args, { isRun: true });
    const res = await executeRaw(sql, values);
    const returnedId = res.rows?.[0]?.id;
    const numericId = returnedId !== undefined && returnedId !== null && Number.isSafeInteger(Number(returnedId))
      ? Number(returnedId)
      : (returnedId ?? null);
    return {
      changes: Number(res.rowCount ?? 0),
      lastInsertRowid: numericId
    };
  }

  async function exec(rawSql) {
    const cleaned = String(rawSql || "").trim();
    if (!cleaned) return;
    const statements = splitSqlStatements(cleaned);
    for (const stmt of statements) {
      const { sql } = translateSqlToPostgres(stmt, [], { isRun: false });
      if (sql) {
        await executeRaw(sql, []);
      }
    }
  }

  function prepare(rawSql) {
    return {
      get: (...args) => get(rawSql, ...args),
      all: (...args) => all(rawSql, ...args),
      run: (...args) => run(rawSql, ...args)
    };
  }

  function transaction(fn) {
    return async function runTransaction(...args) {
      const existingStore = txStorage.getStore();
      if (existingStore) {
        const spName = `sp_${++existingStore.savepointCounter}`;
        await existingStore.client.query(`SAVEPOINT ${spName}`);
        try {
          const result = await fn(...args);
          await existingStore.client.query(`RELEASE SAVEPOINT ${spName}`);
          return result;
        } catch (error) {
          await existingStore.client.query(`ROLLBACK TO SAVEPOINT ${spName}`).catch(() => {});
          throw normalizePostgresError(error);
        }
      }

      const client = await poolGetter().connect();
      const store = { client, savepointCounter: 0 };
      try {
        await client.query("BEGIN");
        const result = await txStorage.run(store, () => fn(...args));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw normalizePostgresError(error);
      } finally {
        client.release();
      }
    };
  }

  return {
    isPostgres: true,
    query: (sql, values = []) => executeRaw(sql, values),
    get,
    all,
    run,
    exec,
    prepare,
    transaction,
    pragma: async () => []
  };
}

export const db = createPostgresDb(getActivePool);

let schemaInitPromise = null;

export async function initPostgresSchema(targetDb = db) {
  if (schemaInitPromise && targetDb === db) {
    return schemaInitPromise;
  }

  const runInit = async () => {
    await targetDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
        admin_level BIGINT NOT NULL DEFAULT 0,
        account_type TEXT NOT NULL DEFAULT 'external',
        created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'external';

      CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_lower ON users (LOWER(email));

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at BIGINT NOT NULL,
        attempts BIGINT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS password_reset_expiry_idx ON password_reset_tokens(expires_at, user_id);

      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        purpose TEXT NOT NULL,
        target_email TEXT,
        code_hash TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        attempts BIGINT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS email_verification_user_idx ON email_verification_codes(user_id, purpose, expires_at);

      CREATE TABLE IF NOT EXISTS account_action_tokens (
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL,
        target_email TEXT NOT NULL DEFAULT '',
        token_hash TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        attempts BIGINT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (user_id, purpose)
      );

      CREATE TABLE IF NOT EXISTS user_presence (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        last_seen_at BIGINT NOT NULL,
        activity TEXT NOT NULL DEFAULT 'Đang trực tuyến'
      );

      CREATE INDEX IF NOT EXISTS user_presence_last_seen_idx ON user_presence(last_seen_at);

      CREATE TABLE IF NOT EXISTS user_progress (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_title TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL DEFAULT 'Toán',
        grade TEXT NOT NULL DEFAULT '10',
        status TEXT NOT NULL DEFAULT 'in_progress',
        progress_percent BIGINT NOT NULL DEFAULT 0 CHECK(progress_percent BETWEEN 0 AND 100),
        score DOUBLE PRECISION,
        answers_json TEXT,
        last_position TEXT,
        started_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        updated_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        UNIQUE(user_id, item_type, item_id)
      );

      CREATE TABLE IF NOT EXISTS exam_attempts (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        document_id TEXT NOT NULL,
        title TEXT NOT NULL,
        subject TEXT NOT NULL,
        grade TEXT NOT NULL,
        category TEXT NOT NULL,
        graded BIGINT NOT NULL DEFAULT 0 CHECK(graded IN (0,1)),
        score DOUBLE PRECISION,
        scale DOUBLE PRECISION,
        percent BIGINT,
        correct_count BIGINT,
        question_count BIGINT,
        answers_json TEXT NOT NULL,
        answer_key_json TEXT,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE INDEX IF NOT EXISTS exam_attempts_user_created_idx ON exam_attempts(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS exam_attempts_document_idx ON exam_attempts(user_id, document_id, id DESC);

      CREATE TABLE IF NOT EXISTS document_submissions (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        grade TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        size BIGINT NOT NULL,
        file_data BYTEA,
        r2_key TEXT,
        content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        answer_key_data BYTEA,
        answer_key_r2_key TEXT,
        answer_key_original_name TEXT,
        answer_key_content_type TEXT,
        answer_key_question_ids TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
        admin_note TEXT,
        reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        reviewed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        grade TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        size BIGINT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        answer_key_data BYTEA,
        answer_key_original_name TEXT,
        answer_key_content_type TEXT,
        answer_key_question_ids TEXT,
        file_data BYTEA,
        r2_key TEXT,
        uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        uploaded_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE TABLE IF NOT EXISTS answer_keys (
        document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        original_name TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        file_data BYTEA,
        r2_key TEXT,
        source_format TEXT NOT NULL,
        normalized_json TEXT,
        question_ids TEXT,
        grading_available BIGINT NOT NULL DEFAULT 0 CHECK(grading_available IN (0,1)),
        normalization_error TEXT,
        uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        uploaded_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE TABLE IF NOT EXISTS exam_solutions (
        document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','reading','solving','review','ready','failed')),
        progress BIGINT NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
        phase TEXT NOT NULL DEFAULT 'queued',
        model TEXT,
        source_hash TEXT,
        generated_json TEXT,
        approved_json TEXT,
        error_code TEXT,
        error_message TEXT,
        solution_version BIGINT NOT NULL DEFAULT 1,
        generated_at TEXT,
        approved_at TEXT,
        approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        updated_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE TABLE IF NOT EXISTS exam_solution_reviews (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        solution_version BIGINT NOT NULL,
        target_id TEXT NOT NULL,
        decision TEXT NOT NULL CHECK(decision IN ('correct','corrected')),
        before_json TEXT NOT NULL,
        after_json TEXT NOT NULL,
        reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE TABLE IF NOT EXISTS app_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        link TEXT,
        read_at TEXT,
        created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, read_at, id DESC);

      CREATE TABLE IF NOT EXISTS ai_solution_history (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        mode TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'text',
        title TEXT NOT NULL,
        model_used TEXT,
        r2_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE INDEX IF NOT EXISTS ai_solution_history_user_created_idx
        ON ai_solution_history(user_id, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS account_deletion_requests (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        target_user_id BIGINT NOT NULL,
        target_name TEXT NOT NULL,
        target_email TEXT NOT NULL,
        target_role TEXT NOT NULL,
        requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        requested_by_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
        reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        requested_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        reviewed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS account_deletion_requests_status_idx ON account_deletion_requests(status, requested_at);

      CREATE TABLE IF NOT EXISTS tests (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT 'Toán',
        grade TEXT NOT NULL DEFAULT '10',
        open_at TEXT NOT NULL,
        close_at TEXT NOT NULL,
        duration_minutes BIGINT,
        answer_mode TEXT NOT NULL DEFAULT 'immediate' CHECK(answer_mode IN ('immediate', 'deferred')),
        has_answer_key BIGINT NOT NULL DEFAULT 0 CHECK(has_answer_key IN (0, 1)),
        raw_text_cache TEXT,
        questions_json TEXT,
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE INDEX IF NOT EXISTS tests_open_close_idx ON tests(open_at, close_at);

      CREATE TABLE IF NOT EXISTS test_submissions (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT 'Toán',
        grade TEXT NOT NULL DEFAULT '10',
        grading_status TEXT NOT NULL DEFAULT 'pending_grade' CHECK(grading_status IN ('pending_grade', 'graded')),
        graded BIGINT NOT NULL DEFAULT 0 CHECK(graded IN (0, 1)),
        score DOUBLE PRECISION,
        scale DOUBLE PRECISION NOT NULL DEFAULT 10,
        percent BIGINT,
        correct_count BIGINT,
        question_count BIGINT,
        duration_minutes BIGINT,
        time_spent_seconds BIGINT,
        auto_submitted_fullscreen BIGINT NOT NULL DEFAULT 0 CHECK(auto_submitted_fullscreen IN (0, 1)),
        answers_json TEXT NOT NULL,
        answer_key_json TEXT,
        result_json TEXT NOT NULL,
        teacher_note TEXT,
        started_at TEXT,
        submitted_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        graded_at TEXT,
        graded_by BIGINT REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS test_submissions_test_user_idx ON test_submissions(test_id, user_id, id DESC);
      CREATE INDEX IF NOT EXISTS test_submissions_status_idx ON test_submissions(grading_status, submitted_at DESC);

      CREATE TABLE IF NOT EXISTS chat_conversations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('global', 'direct')),
        title TEXT,
        created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        updated_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE TABLE IF NOT EXISTS chat_participants (
        conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        last_read_message_id BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (conversation_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id, conversation_id);
      CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations(updated_at DESC);

      CREATE TABLE IF NOT EXISTS subjects_catalog (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        default_scale DOUBLE PRECISION NOT NULL DEFAULT 10,
        display_order BIGINT NOT NULL DEFAULT 100,
        active BIGINT NOT NULL DEFAULT 1,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        updated_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE TABLE IF NOT EXISTS learning_results (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        record_key TEXT NOT NULL UNIQUE,
        user_id BIGINT NOT NULL,
        user_name TEXT NOT NULL,
        user_email TEXT NOT NULL,
        subject_code TEXT NOT NULL,
        subject_name TEXT NOT NULL,
        grade TEXT NOT NULL DEFAULT '10',
        category TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_title TEXT NOT NULL,
        attempt_id BIGINT,
        completion_status TEXT NOT NULL DEFAULT 'completed',
        grading_status TEXT NOT NULL DEFAULT 'not_applicable',
        progress_percent BIGINT NOT NULL DEFAULT 100,
        score DOUBLE PRECISION,
        scale DOUBLE PRECISION DEFAULT 10,
        percent_score DOUBLE PRECISION,
        correct_count BIGINT,
        question_count BIGINT,
        duration_minutes BIGINT,
        time_spent_seconds BIGINT,
        fullscreen_exit_auto_submit BIGINT NOT NULL DEFAULT 0,
        open_at TEXT,
        close_at TEXT,
        started_at TEXT,
        submitted_at TEXT,
        graded_at TEXT,
        graded_by_id BIGINT,
        graded_by_name TEXT,
        section_breakdown_json TEXT,
        extra_metadata_json TEXT,
        updated_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE INDEX IF NOT EXISTS learning_results_user_idx ON learning_results(user_id, category, updated_at DESC);
      CREATE INDEX IF NOT EXISTS learning_results_subject_idx ON learning_results(subject_code, grade, category, submitted_at DESC);
      CREATE INDEX IF NOT EXISTS learning_results_item_idx ON learning_results(item_id, category, grading_status);
    `);

    // Ensure backward-compatible columns on migrated tables
    const backwardCompatibleColumns = [
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_level BIGINT NOT NULL DEFAULT 0",
      "ALTER TABLE users ALTER COLUMN created_at SET DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))",
      // Recover historical timestamps only when a matching account event exists.
      // If an old account has no recoverable event, leave the date blank rather than inventing one.
      "UPDATE users SET created_at = (SELECT MIN(n.created_at) FROM notifications n WHERE (n.user_id = users.id AND n.type = 'account_created') OR (n.type IN ('admin_created', 'admin_promoted') AND LOWER(COALESCE(n.message, '')) LIKE '%' || LOWER(users.email) || '%')) WHERE (created_at IS NULL OR BTRIM(created_at) = '' OR (created_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' AND created_at !~ '^[0-9]{10,13}$')) AND EXISTS (SELECT 1 FROM notifications n WHERE (n.user_id = users.id AND n.type = 'account_created') OR (n.type IN ('admin_created', 'admin_promoted') AND LOWER(COALESCE(n.message, '')) LIKE '%' || LOWER(users.email) || '%'))",
      "ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS item_title TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE document_submissions ADD COLUMN IF NOT EXISTS file_data BYTEA",
      "ALTER TABLE document_submissions ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'application/octet-stream'",
      "ALTER TABLE document_submissions ADD COLUMN IF NOT EXISTS answer_key_data BYTEA",
      "ALTER TABLE document_submissions ADD COLUMN IF NOT EXISTS answer_key_original_name TEXT",
      "ALTER TABLE document_submissions ADD COLUMN IF NOT EXISTS answer_key_content_type TEXT",
      "ALTER TABLE document_submissions ADD COLUMN IF NOT EXISTS answer_key_question_ids TEXT",
      "ALTER TABLE document_submissions ADD COLUMN IF NOT EXISTS r2_key TEXT",
      "ALTER TABLE document_submissions ADD COLUMN IF NOT EXISTS answer_key_r2_key TEXT",
      "ALTER TABLE documents ADD COLUMN IF NOT EXISTS answer_key_data BYTEA",
      "ALTER TABLE documents ADD COLUMN IF NOT EXISTS answer_key_original_name TEXT",
      "ALTER TABLE documents ADD COLUMN IF NOT EXISTS answer_key_content_type TEXT",
      "ALTER TABLE documents ADD COLUMN IF NOT EXISTS answer_key_question_ids TEXT",
      "ALTER TABLE documents ADD COLUMN IF NOT EXISTS r2_key TEXT",
      "ALTER TABLE answer_keys ADD COLUMN IF NOT EXISTS r2_key TEXT",
      "ALTER TABLE documents ALTER COLUMN file_data DROP NOT NULL",
      "ALTER TABLE answer_keys ALTER COLUMN file_data DROP NOT NULL"
    ];
    for (const stmt of backwardCompatibleColumns) {
      try {
        await targetDb.exec(stmt);
      } catch {
        // Ignore if column constraint already matches
      }
    }

    // Sync PostgreSQL identity sequences so post-migration inserts never collide with imported IDs
    for (const table of IDENTITY_TABLES) {
      try {
        await targetDb.query(
          `SELECT setval(
            pg_get_serial_sequence($1, 'id'),
            GREATEST(COALESCE((SELECT MAX(id) FROM "${table}"), 1), 1),
            (SELECT COUNT(*) > 0 FROM "${table}")
          )`,
          [`public.${table}`]
        );
      } catch {
        // Ignore if table has no sequence in custom test harness
      }
    }
  };

  if (targetDb === db) {
    schemaInitPromise = runInit().catch((err) => {
      schemaInitPromise = null;
      throw err;
    });
    return schemaInitPromise;
  }
  return runInit();
}
