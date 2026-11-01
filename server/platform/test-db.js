import { PGlite } from "@electric-sql/pglite";
import { createPostgresDb, initPostgresSchema } from "../postgres.js";
import { migrate } from "./migrate.js";
import { initSchoolSystemDatabase } from "../school-system.js";
export async function testDatabase({ memoryOnly = false } = {}) {
  if (process.env.MAIHOC_TEST_DATABASE_URL && !memoryOnly) {
    const url = new URL(process.env.MAIHOC_TEST_DATABASE_URL);
    if (!url.pathname.toLowerCase().includes("test"))
      throw new Error("Use an isolated database whose name contains test.");
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: url.href });
    const database = createPostgresDb(() => pool);
    const existing = (
      await pool.query("SELECT to_regclass('public.users') AS users")
    ).rows[0];
    if (existing.users)
      throw new Error(
        "Integration database must be empty. Never point this runner at production.",
      );
    await initPostgresSchema(database);
    await initSchoolSystemDatabase(database);
    await migrate(database);
    return { db: database, pool, close: () => pool.end() };
  }
  const pg = new PGlite();
  let tail = Promise.resolve();
  const query = async (sql, values = []) => {
    if (
      !values.length &&
      sql
        .trim()
        .split(";")
        .filter((x) => x.trim()).length > 1
    ) {
      const result = await pg.exec(sql);
      const last = result.at(-1) || {};
      return { ...last, rowCount: last.affectedRows || last.rows?.length || 0 };
    }
    const result = await pg.query(sql, values);
    return {
      ...result,
      rowCount: result.affectedRows || result.rows?.length || 0,
    };
  };
  const testPool = {
    query,
    async connect() {
      let release;
      const done = new Promise((r) => (release = r));
      const previous = tail;
      tail = tail.then(() => done);
      await previous;
      return { query, release };
    },
    async end() {},
  };
  const database = createPostgresDb(() => testPool);
  await initPostgresSchema(database);
  await initSchoolSystemDatabase(database);
  await migrate(database);
  return { db: database, pg, pool: testPool, close: () => pg.close() };
}
