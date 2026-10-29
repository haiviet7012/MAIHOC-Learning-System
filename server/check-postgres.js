import { pool } from "./postgres.js";

try {
  const result = await pool.query(`
    SELECT
      current_database() AS database_name,
      current_timestamp AS server_time
  `);

  console.log("Kết nối PostgreSQL thành công:");
  console.log(result.rows[0]);
} catch (error) {
  console.error("Không thể kết nối PostgreSQL:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}