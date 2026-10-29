import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(
  __dirname,
  "data",
  "maihoc.sqlite"
);

const outputPath = path.join(
  __dirname,
  "sqlite-schema.sql"
);

const db = new Database(dbPath, {
  readonly: true,
  fileMustExist: true,
});

try {
  const objects = db.prepare(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_master
    WHERE sql IS NOT NULL
      AND name NOT LIKE 'sqlite_%'
    ORDER BY
      CASE type
        WHEN 'table' THEN 1
        WHEN 'index' THEN 2
        WHEN 'trigger' THEN 3
        ELSE 4
      END,
      name
  `).all();

  const output = objects
    .map(({ type, name, sql }) => {
      return `-- ${type}: ${name}\n${sql};`;
    })
    .join("\n\n");

  writeFileSync(outputPath, output + "\n", "utf8");

  console.log("Đã xuất schema SQLite:");
  console.log(outputPath);
  console.log("Số đối tượng:", objects.length);
} catch (error) {
  console.error("Lỗi khi xuất schema:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}