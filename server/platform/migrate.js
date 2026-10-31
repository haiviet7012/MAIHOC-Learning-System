import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { db, pool } from "../postgres.js";
export async function migrationPlan() {
  const directory = new URL("./migrations/", import.meta.url);
  return Promise.all(
    (await readdir(directory))
      .filter((x) => x.endsWith(".sql"))
      .sort()
      .map(async (name) => {
        const sql = await readFile(new URL(name, directory), "utf8");
        return {
          name: `platform:${name}`,
          sql,
          checksum: createHash("sha256").update(sql).digest("hex"),
        };
      }),
  );
}
export async function migrate(target = db) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.MAIHOC_BACKUP_VERIFIED !== "1"
  )
    throw new Error(
      "Production migration requires MAIHOC_BACKUP_VERIFIED=1 after restore rehearsal.",
    );
  const plan = await migrationPlan();
  return target.transaction(async () => {
    await target.query(
      "SELECT pg_advisory_xact_lock(hashtext('maihoc-platform-migrations'))",
    );
    const base = await target.query(
      "SELECT to_regclass('public.users') AS users, to_regclass('public.tests') AS tests",
    );
    if (!base.rows[0]?.users || !base.rows[0]?.tests)
      throw new Error(
        "Existing MAIHOC base schema is required; do not run the SQLite importer.",
      );
    await target.query(
      "ALTER TABLE app_migrations ADD COLUMN IF NOT EXISTS checksum TEXT",
    );
    await target.query(
      "ALTER TABLE app_migrations ADD COLUMN IF NOT EXISTS duration_ms BIGINT",
    );
    const result = [];
    for (const migration of plan) {
      const existing = (
        await target.query(
          "SELECT checksum FROM app_migrations WHERE name=$1",
          [migration.name],
        )
      ).rows[0];
      if (existing) {
        if (existing.checksum !== migration.checksum)
          throw new Error(`Migration checksum mismatch: ${migration.name}`);
        continue;
      }
      const started = Date.now();
      await target.query(migration.sql);
      await target.query(
        "INSERT INTO app_migrations(name,checksum,duration_ms) VALUES($1,$2,$3)",
        [migration.name, migration.checksum, Date.now() - started],
      );
      result.push(migration.name);
    }
    return result;
  })();
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.argv.includes("--apply"))
      console.log(JSON.stringify({ applied: await migrate() }));
    else
      console.log(
        JSON.stringify(
          {
            mode: "plan-only",
            migrations: (await migrationPlan()).map(({ name, checksum }) => ({
              name,
              checksum,
            })),
            note: "No database writes. Backfill is a separate explicit operation.",
          },
          null,
          2,
        ),
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (process.argv.includes("--apply")) await pool.end();
  }
}
