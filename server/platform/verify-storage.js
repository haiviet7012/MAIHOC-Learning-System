// Read-only inventory. Does not copy, rename, restore or delete R2 objects.
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "../r2-storage.js";
import { db, pool } from "../postgres.js";
const limit = Number(process.env.MAIHOC_STORAGE_VERIFY_LIMIT || 100);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000)
  throw new Error("MAIHOC_STORAGE_VERIFY_LIMIT must be between 1 and 10000.");
try {
  const result = await db.query(
    `SELECT 'documents' AS source,id::text AS id,r2_key,size FROM documents WHERE r2_key IS NOT NULL AND r2_key<>'' UNION ALL SELECT 'answer_keys',document_id::text,r2_key,NULL::bigint FROM answer_keys WHERE r2_key IS NOT NULL AND r2_key<>'' UNION ALL SELECT 'document_submissions',id::text,r2_key,size FROM document_submissions WHERE r2_key IS NOT NULL AND r2_key<>'' UNION ALL SELECT 'ai_solution_history',id::text,r2_key,NULL::bigint FROM ai_solution_history WHERE r2_key IS NOT NULL AND r2_key<>''`,
  );
  const selected = result.rows.slice(0, limit),
    checks = [];
  for (const item of selected) {
    try {
      const object = await r2.send(
        new HeadObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: item.r2_key,
        }),
      );
      checks.push({
        ...item,
        exists: true,
        sizeMatches:
          item.size == null ? null : Number(item.size) === object.ContentLength,
        objectSize: object.ContentLength,
        contentType: object.ContentType,
      });
    } catch (error) {
      checks.push({ ...item, exists: false, error: error.name });
    }
  }
  console.log(
    JSON.stringify(
      {
        references: result.rows.length,
        checked: checks.length,
        remaining: Math.max(0, result.rows.length - checks.length),
        checks,
      },
      null,
      2,
    ),
  );
  if (checks.some((c) => !c.exists || c.sizeMatches === false))
    process.exitCode = 1;
} finally {
  await pool.end();
}
