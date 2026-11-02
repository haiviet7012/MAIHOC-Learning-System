import { hasActiveExam } from "./policy.js";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { db, pool } from "../postgres.js";
import { solveUniversalProblem } from "../ai-solver/service.js";
export async function workOnce({
  database = db,
  solve = solveUniversalProblem,
} = {}) {
  const token = randomUUID();
  const job = await database.transaction(async () => {
    const claimed = (
      await database.query(
        `WITH candidate AS (SELECT id FROM platform_jobs WHERE (status='queued' AND available_at<=now()) OR (status='running' AND lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE platform_jobs j SET status='running',attempts=attempts+1,lease_until=now()+interval '5 minutes',lease_token=$1 FROM candidate c WHERE j.id=c.id RETURNING j.*`,
        [token],
      )
    ).rows[0];
    return claimed;
  })();
  if (!job) return false;
  const heartbeat = setInterval(() => {
    void database
      .query(
        "UPDATE platform_jobs SET lease_until=now()+interval '5 minutes' WHERE id=$1 AND lease_token=$2 AND status='running'",
        [job.id, token],
      )
      .catch(() => {});
  }, 60000);
  heartbeat.unref?.();
  try {
    if (job.attempts > 3) throw new Error("Đã hết số lần thử tác vụ.");
    if (await hasActiveExam(database, job.user_id))
      throw new Error("Gia sư AI tạm dừng trong phiên kiểm tra.");
    const result = await solve(job.payload);
    await database.query(
      "UPDATE platform_jobs SET status='completed',result=$3,completed_at=now(),lease_until=NULL WHERE id=$1 AND lease_token=$2 AND status='running'",
      [job.id, token, JSON.stringify(result)],
    );
  } catch (error) {
    await database.query(
      "UPDATE platform_jobs SET status=$3,error=$4,available_at=now()+make_interval(secs=>$5),lease_until=NULL WHERE id=$1 AND lease_token=$2 AND status='running'",
      [
        job.id,
        token,
        job.attempts >= 3 || (error.safeAiError && !error.retryable) ? "failed" : "queued",
        String(error.message).slice(0, 1000),
        Math.min(300, 2 ** job.attempts * 10),
      ],
    );
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let stopping = false;
  let wake;
  process.on("SIGTERM", () => {
    stopping = true;
    wake?.();
  });
  process.on("SIGINT", () => {
    stopping = true;
    wake?.();
  });
  try {
    while (!stopping) {
      if (!(await workOnce()))
        await new Promise((resolve) => {
          wake = resolve;
          setTimeout(resolve, 2000);
        });
    }
  } finally {
    await pool.end();
  }
}
