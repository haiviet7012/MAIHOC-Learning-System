process.env.MAIHOC_SKIP_AUTO_LISTEN = "1";
if (!process.argv.includes("--apply")) {
  console.log(
    "Preview only: legacy document/category/answer-key/R2 normalization and results reconciliation. Pass --apply after backup and staging rehearsal.",
  );
  process.exit(0);
}
if (
  process.env.NODE_ENV === "production" &&
  process.env.MAIHOC_BACKUP_VERIFIED !== "1"
)
  throw new Error("Restore rehearsal required: MAIHOC_BACKUP_VERIFIED=1");
const {
  runLegacyMaintenance,
  initializeApplicationRuntime,
  stopPresenceCleanup,
  server,
} = await import("../server/server.js");
const { syncFromMainDatabase } =
  await import("../server/tests-module/results-db.js");
const { pool } = await import("../server/postgres.js");
try {
  await initializeApplicationRuntime();
  await runLegacyMaintenance();
  await syncFromMainDatabase();
  console.log("Legacy maintenance completed.");
} finally {
  stopPresenceCleanup();
  server.close();
  await pool.end();
}
