import pg from "pg";

const { Pool } = pg;
const authBackend = String(process.env.MAIHOC_AUTH_BACKEND || "sqlite").trim().toLowerCase();

if (authBackend === "postgres" && !process.env.DATABASE_URL) {
  throw new Error("MAIHOC_AUTH_BACKEND=postgres yêu cầu DATABASE_URL.");
}

export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
  : null;

pool?.on("error", (error) => {
  console.error("Lỗi kết nối PostgreSQL:", error.message);
});
