import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
dotenv.config({ path: path.join(dirname, ".env") });
dotenv.config({ path: path.resolve(dirname, "..", ".env") });
dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error("Thiếu DATABASE_URL. Không đưa giá trị bí mật này vào log hoặc Git.");
  process.exitCode = 1;
} else {
  const { pool } = await import("./postgres.js");
  try {
    const connection = await pool.query(
      "SELECT current_database() AS database_name, current_user AS database_user, current_timestamp AS server_time"
    );
    const requiredColumns = {
      users: ["id", "name", "email", "password_hash", "role", "admin_level", "created_at"],
      sessions: ["token_hash", "user_id", "expires_at", "created_at"],
      user_presence: ["user_id", "last_seen_at", "activity"],
      email_verification_codes: ["id", "user_id", "email", "purpose", "target_email", "code_hash", "expires_at", "attempts", "created_at"]
    };
    const required = Object.keys(requiredColumns);
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables " +
      "WHERE table_schema='public' AND table_name = ANY($1::text[]) ORDER BY table_name",
      [required]
    );
    const present = new Set(tables.rows.map((row) => row.table_name));
    const missing = required.filter((table) => !present.has(table));
    const columns = await pool.query(
      "SELECT table_name,column_name FROM information_schema.columns " +
      "WHERE table_schema='public' AND table_name = ANY($1::text[])",
      [required]
    );
    const availableColumns = new Map();
    for (const row of columns.rows) {
      if (!availableColumns.has(row.table_name)) availableColumns.set(row.table_name, new Set());
      availableColumns.get(row.table_name).add(row.column_name);
    }
    const missingColumns = Object.entries(requiredColumns).flatMap(([table, names]) =>
      names.filter((name) => present.has(table) && !availableColumns.get(table)?.has(name))
        .map((name) => table + "." + name)
    );
    const report = {
      mode: "READ-ONLY POSTGRES AUTH PREFLIGHT",
      target: connection.rows[0],
      requiredTables: required.map((table) => ({ table, exists: present.has(table) })),
      missingTables: missing,
      missingColumns,
      counts: null,
      duplicateEmails: [],
      note: "Chỉ đọc PostgreSQL; không tạo, sửa hoặc xóa dữ liệu."
    };

    if (!missing.includes("users") && !missingColumns.some((column) => column.startsWith("users."))) {
      const [users, admins, duplicates] = await Promise.all([
        pool.query("SELECT COUNT(*)::bigint AS count FROM users"),
        pool.query("SELECT COUNT(*)::bigint AS count FROM users WHERE role='admin'"),
        pool.query(
          "SELECT LOWER(email) AS normalized_email, COUNT(*)::bigint AS count " +
          "FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1 ORDER BY LOWER(email)"
        )
      ]);
      report.counts = { users: Number(users.rows[0].count), admins: Number(admins.rows[0].count) };
      report.duplicateEmails = duplicates.rows.map((row) => ({
        normalizedEmail: row.normalized_email,
        count: Number(row.count)
      }));
    }
    if (!missing.includes("sessions") && !missingColumns.some((column) => column.startsWith("sessions."))) {
      const sessions = await pool.query(
        "SELECT COUNT(*) FILTER (WHERE expires_at > $1)::bigint AS active, " +
        "COUNT(*) FILTER (WHERE expires_at <= $1)::bigint AS expired FROM sessions",
        [Date.now()]
      );
      report.counts = { ...(report.counts || {}), sessions: {
        active: Number(sessions.rows[0].active),
        expired: Number(sessions.rows[0].expired)
      }};
    }
    if (!missing.includes("user_presence") && !missingColumns.some((column) => column.startsWith("user_presence."))) {
      const presence = await pool.query("SELECT COUNT(*)::bigint AS count FROM user_presence");
      report.counts = { ...(report.counts || {}), presenceRows: Number(presence.rows[0].count) };
    }
    if (!missing.includes("email_verification_codes") && !missingColumns.some((column) => column.startsWith("email_verification_codes."))) {
      const codes = await pool.query(
        "SELECT COUNT(*)::bigint AS count FROM email_verification_codes WHERE expires_at > $1",
        [Date.now()]
      );
      report.counts = { ...(report.counts || {}), unexpiredVerificationCodes: Number(codes.rows[0].count) };
    }

    console.log(JSON.stringify(report, null, 2));
    if (missing.length || missingColumns.length || report.duplicateEmails.length) {
      console.error("PREFLIGHT CHƯA ĐẠT: sửa các bảng thiếu hoặc email trùng trước khi bật backend PostgreSQL.");
      process.exitCode = 1;
    } else {
      console.log("PREFLIGHT ĐẠT: các bảng auth cần thiết tồn tại và email không trùng.");
    }
  } catch (error) {
    console.error("Không thể kiểm tra PostgreSQL auth:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}