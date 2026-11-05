import { literatureConfig } from "./literature-provider.js";
import { createLiteratureGenerator } from "./literature-ai.js";
import { gradeLiteratureSubmission, validateLiteratureExam } from "./literature-engine.js";

// Teacher/admin preview API. Returns proposals only; does not publish or persist official scores.
export function installLiteratureRoutes(app, {
  requireAdmin, requireSameOrigin, env = process.env,
  generatorFactory = createLiteratureGenerator, now = Date.now
}) {
  const requests = new Map();
  const windowMs = 60_000;
  function limit(req, res, next) {
    res.setHeader("Cache-Control", "private, no-store");
    const time = now();
    for (const [id, entry] of requests) if (entry.resetAt <= time) requests.delete(id);
    const id = String(req.user.id);
    let entry = requests.get(id);
    if (!entry) {
      entry = { count: 0, resetAt: time + windowMs };
      requests.set(id, entry);
    }
    if (++entry.count > 12) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - time) / 1000))));
      return res.status(429).json({ error: "Bạn gửi quá nhiều yêu cầu chấm Văn. Vui lòng thử lại sau." });
    }
    next();
  }

  app.post("/api/admin/literature/grade", requireSameOrigin, requireAdmin, limit, async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some(key => !["exam", "answers"].includes(key))) {
      return res.status(400).json({ error: "Chỉ gửi exam và answers; cấu hình AI lấy từ backend." });
    }
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > 512 * 1024) {
      return res.status(413).json({ error: "Đề và bài làm không được vượt quá 512 KiB." });
    }
    let exam;
    try {
      // Caller is an authorized author/reviewer, never a student asserting their own approval.
      exam = validateLiteratureExam(body.exam);
    } catch {
      return res.status(400).json({ error: "Cần đề Ngữ văn đã duyệt, đủ ngữ liệu và hướng dẫn chấm 7 câu." });
    }
    const ids = new Set(exam.questions.map(q => q.targetId));
    const answers = body.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)
      || !Object.entries(answers).every(([id, value]) => ids.has(id) && typeof value === "string" && value.length <= 30000)) {
      return res.status(400).json({ error: "Bài làm cần là object theo ID câu; mỗi câu tối đa 30000 ký tự." });
    }
    let generate;
    if (Object.values(answers).some(value => value.trim())) {
      try {
        const config = literatureConfig(env);
        generate = generatorFactory({ apiKey: config.apiKey, modelName: config.model,
          provider: config.provider, ...(config.provider === "nvidia" ? {
            baseUrl: config.baseUrl, maxTokens: config.maxTokens, timeoutMs: config.timeoutMs
          } : {}) });
      } catch {
        return res.status(503).json({ code: "LITERATURE_AI_NOT_CONFIGURED",
          error: "Cần cấu hình provider, API key và model riêng Ngữ văn hợp lệ trên backend." });
      }
    }
    // The engine converts provider failures/malformed scores to pending without leaking errors or secrets.
    const result = await gradeLiteratureSubmission({ exam, answers, generate });
    return res.status(result.gradingStatus === "pending_review" ? 202 : 200).json(result);
  });
}
