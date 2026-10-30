import crypto from "node:crypto";
import { db } from "../auth.js";
import { uploadToR2, readFromR2, deleteFromR2 } from "../r2-storage.js";

function cleanText(value, maxLength, fallback = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength) || fallback;
}

/**
 * Persist the AI answer as a private R2 object and keep only searchable metadata in PostgreSQL.
 * The R2 key is never returned to the browser; all reads go through the owner-checked endpoint.
 */
export async function saveAiSolutionHistory({ userId, subject, mode, source, title, prompt, solution }) {
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) < 1) return null;

  const createdAt = new Date().toISOString();
  const safeSubject = cleanText(subject, 80, "Không rõ môn học");
  const safeMode = cleanText(mode, 24, "detailed");
  const safeSource = ["text", "image", "pdf"].includes(source) ? source : "text";
  const safeTitle = cleanText(title, 180, `Bài tập ${safeSubject}`);
  const key = `ai-solutions/${Number(userId)}/${createdAt.slice(0, 7)}/${crypto.randomUUID()}.json`;
  const stored = {
    subject: safeSubject,
    mode: safeMode,
    source: safeSource,
    title: safeTitle,
    promptPreview: cleanText(prompt, 12000),
    createdAt,
    solution
  };

  await uploadToR2({
    key,
    body: Buffer.from(JSON.stringify(stored), "utf8"),
    contentType: "application/json; charset=utf-8"
  });

  try {
    const result = await db.prepare(`
      INSERT INTO ai_solution_history(user_id, subject, mode, source, title, model_used, r2_key, created_at)
      VALUES(?,?,?,?,?,?,?,datetime('now'))
    `).run(
      Number(userId),
      safeSubject,
      safeMode,
      safeSource,
      safeTitle,
      cleanText(solution?.modelUsed, 100),
      key
    );
    const row = await db.prepare(`
      SELECT id, subject, mode, source, title, model_used AS modelUsed, created_at AS createdAt
      FROM ai_solution_history WHERE id=? AND user_id=?
    `).get(Number(result.lastInsertRowid), Number(userId));
    return row || null;
  } catch (error) {
    await deleteFromR2(key).catch(cleanupError => {
      console.warn("[AI history] Could not remove unindexed R2 object:", cleanupError.message);
    });
    throw error;
  }
}

export async function listAiSolutionHistory(userId) {
  return await db.prepare(`
    SELECT id, subject, mode, source, title, model_used AS modelUsed, created_at AS createdAt
    FROM ai_solution_history
    WHERE user_id=?
    ORDER BY created_at DESC, id DESC
  `).all(Number(userId));
}

export async function getAiSolutionHistory(userId, historyId) {
  const row = await db.prepare(`
    SELECT id, subject, mode, source, title, model_used AS modelUsed, r2_key AS r2Key, created_at AS createdAt
    FROM ai_solution_history
    WHERE user_id=? AND id=?
  `).get(Number(userId), Number(historyId));

  if (!row) return null;
  const object = await readFromR2(row.r2Key);
  if (!object?.Body) throw new Error("Không tìm thấy nội dung lời giải trong R2.");

  const raw = Buffer.from(await object.Body.transformToByteArray()).toString("utf8");
  const saved = JSON.parse(raw);
  return {
    id: row.id,
    subject: row.subject,
    mode: row.mode,
    source: row.source,
    title: row.title,
    modelUsed: row.modelUsed,
    createdAt: row.createdAt,
    promptPreview: saved.promptPreview || "",
    solution: saved.solution
  };
}

/** Remove a user's private solution objects before their account metadata is cascaded away. */
export async function deleteAiSolutionHistoryForUser(userId) {
  const rows = await db.prepare("SELECT r2_key AS r2Key FROM ai_solution_history WHERE user_id=?").all(Number(userId));
  const results = await Promise.allSettled(rows.map(row => deleteFromR2(row.r2Key)));
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[AI history] Could not remove R2 object during account deletion:", result.reason?.message || result.reason);
    }
  }
}
