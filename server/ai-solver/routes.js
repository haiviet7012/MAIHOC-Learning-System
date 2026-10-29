import express from "express";
import { validateUniversalSolveRequest } from "./validator.js";
import { solveUniversalProblem } from "./service.js";

export const universalAiRouter = express.Router();
const requestsByIp = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;

function rateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let entry = requestsByIp.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    requestsByIp.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > MAX_REQUESTS) {
    return res.status(429).json({ error: "Bạn gửi quá nhiều yêu cầu. Vui lòng chờ một phút rồi thử lại." });
  }
  if (requestsByIp.size > 2000) {
    for (const [ip, value] of requestsByIp) if (value.resetAt <= now) requestsByIp.delete(ip);
  }
  next();
}

universalAiRouter.post("/solve", rateLimit, async (req, res) => {
  const validation = validateUniversalSolveRequest(req.body);
  if (!validation.valid) return res.status(400).json({ error: validation.error });
  try {
    const solution = await solveUniversalProblem(validation.data);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, solution });
  } catch (error) {
    const status = error.status || (error.code === "MISSING_API_KEY" ? 503 : 502);
    return res.status(status).json({ error: error.message || "Không thể giải bài lúc này." });
  }
});
