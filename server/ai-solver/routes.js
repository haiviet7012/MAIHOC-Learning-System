import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import { uploadToR2, readFromR2, deleteFromR2 } from "../r2-storage.js";
import { validateUniversalSolveRequest } from "./validator.js";
import { solveUniversalProblem } from "./service.js";

export const universalAiRouter = express.Router();
const requestsByIp = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 8, fieldSize: 64 * 1024 },
  fileFilter(_req, file, callback) {
    const allowed = file.fieldname === "file"
      ? (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf"))
      : file.fieldname === "image" && ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
    callback(allowed ? null : new Error(file.fieldname === "file" ? "Chỉ hỗ trợ tệp PDF." : "Ảnh phải ở định dạng PNG, JPG hoặc WebP."), allowed);
  }
});

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

function parseMultipart(req) {
  const file = req.files?.file?.[0];
  const image = req.files?.image?.[0];
  return {
    ...req.body,
    file: file ? { name: file.originalname, mimeType: "application/pdf", data: file.buffer.toString("base64") } : req.body.file,
    image: image ? { mimeType: image.mimetype, data: image.buffer.toString("base64") } : req.body.image
  };
}

async function persistTemporaryUpload(file, fieldName) {
  if (!file?.buffer) return null;
  const key = `ai-temporary/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${fieldName}`;
  await uploadToR2({ key, body: file.buffer, contentType: file.mimetype || "application/octet-stream" });
  try {
    const object = await readFromR2(key);
    if (!object?.Body) throw new Error("Không thể đọc lại tệp tạm từ R2.");
    const buffer = Buffer.from(await object.Body.transformToByteArray());
    if (buffer.length !== file.size) throw new Error("Kích thước tệp đọc từ R2 không khớp.");
    return { key, buffer };
  } catch (error) {
    await deleteFromR2(key).catch(() => {});
    throw error;
  }
}

universalAiRouter.post("/solve", rateLimit, (req, res, next) => {
  if (req.is("multipart/form-data")) {
    upload.fields([{ name: "file", maxCount: 1 }, { name: "image", maxCount: 1 }])(req, res, error => {
      if (error) {
        const status = error instanceof multer.MulterError
          ? (error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
          : 400;
        return res.status(status).json({ error: error.message || "Không thể nhận tệp tải lên." });
      }
      next();
    });
  } else {
    next();
  }
}, async (req, res) => {
  let tempUploads = [];
  try {
    let body = req.body;
    if (req.is("multipart/form-data")) {
      const uploaded = req.files?.file?.[0] || req.files?.image?.[0];
      if (uploaded) {
        const temp = await persistTemporaryUpload(uploaded, uploaded.fieldname);
        tempUploads.push(temp.key);
        body = {
          ...req.body,
          ...(uploaded.fieldname === "file"
            ? { file: { name: uploaded.originalname, mimeType: "application/pdf", data: temp.buffer.toString("base64") } }
            : { image: { mimeType: uploaded.mimetype, data: temp.buffer.toString("base64") } })
        };
      }
    }
    const validation = validateUniversalSolveRequest(body);
    if (!validation.valid) return res.status(400).json({ error: validation.error });
    const solution = await solveUniversalProblem(validation.data);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, solution });
  } catch (error) {
    const status = error.status || (error.code === "MISSING_API_KEY" ? 503 : 502);
    return res.status(status).json({ error: error.message || "Không thể giải bài lúc này." });
  } finally {
    await Promise.all(tempUploads.map(key => deleteFromR2(key).catch(error => {
      console.warn("[R2] Could not delete temporary AI upload:", error.message);
    })));
  }
});
