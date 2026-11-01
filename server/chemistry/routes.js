/**
 * server/chemistry/routes.js
 * Tuyến API cho Phân hệ Hóa học
 */

import express from "express";
import { validateChemistrySolveRequest } from "./chemistry-validator.js";
import { solveChemistryProblem } from "./solver-service.js";

export const chemistryRouter = express.Router();

// Bộ nhớ đệm giới hạn tần suất (Rate Limiter) đơn giản theo IP
const solveRateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 phút
const MAX_REQUESTS_PER_WINDOW = 12;

function chemistryRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let clientRecord = solveRateLimitMap.get(ip);

  if (!clientRecord || clientRecord.resetAt <= now) {
    clientRecord = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    solveRateLimitMap.set(ip, clientRecord);
  }

  clientRecord.count++;
  if (clientRecord.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: "Bạn đã gửi quá nhiều yêu cầu giải bài liên tiếp. Vui lòng chờ 1 phút trước khi tiếp tục."
    });
  }

  // Thu gom rác định kỳ cho Map
  if (solveRateLimitMap.size > 2000) {
    for (const [k, v] of solveRateLimitMap.entries()) {
      if (v.resetAt <= now) solveRateLimitMap.delete(k);
    }
  }

  next();
}

/**
 * POST /api/chemistry/solve
 * Tiếp nhận bài tập Hóa học (văn bản hoặc ảnh) và trả về lời giải có cấu trúc
 */
chemistryRouter.post("/solve", chemistryRateLimit, async (req, res) => {
  const validation = validateChemistrySolveRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const solution = await solveChemistryProblem(validation.data);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, solution });
  } catch (error) {
    const status = error.status || (error.code === "MISSING_API_KEY" ? 503 : 500);
    return res.status(status).json({
      error: error.message || "Không thể tạo lời giải Hóa học lúc này.",
      ...(error.safeAiError ? { code: error.code } : {})
    });
  }
});

