import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Điều chỉnh đường dẫn nếu database thực tế nằm ở nơi khác.
const dbPath = path.join(__dirname, "data", "maihoc.sqlite");

const db = new Database(dbPath, {
  readonly: true,
  fileMustExist: true,
});

try {
  const tables = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `)
    .all();

  console.log("\n=== DANH SÁCH BẢNG SQLITE ===");

  for (const { name } of tables) {
    console.log(`\n--- Bảng: ${name} ---`);

    const columns = db
      .prepare(`PRAGMA table_info("${name.replaceAll('"', '""')}")`)
      .all();

    console.table(
      columns.map((column) => ({
        column: column.name,
        type: column.type,
        notNull: Boolean(column.notnull),
        primaryKey: Boolean(column.pk),
      }))
    );

    const count = db
      .prepare(`SELECT COUNT(*) AS total FROM "${name.replaceAll('"', '""')}"`)
      .get();

    console.log("Số bản ghi:", count.total);
  }
} catch (error) {
  console.error("Không thể kiểm tra SQLite:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}