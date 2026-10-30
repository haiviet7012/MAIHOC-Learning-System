import {
  uploadToR2,
  readFromR2,
  deleteFromR2
} from "./r2-storage.js";

import express from "express";
import http from "node:http";
import { setupChat, initChatDatabase } from "./chat.js";
import multer from "multer";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import nodemailer from "nodemailer";
import { normalizeAnswerKey, normalizeAnswerKeyDocument, gradeAnswers } from "./grading/engine.js";
import { solveExamDocument, isAIQuotaError } from "./grading/exam-solution-engine.js";
import { installStudyRooms } from "./study-rooms/server.js";
import { installTestsModule } from "./tests-module/index.js";
import {
  upsertLearningResult,
  deleteLearningResultsByUserId,
  deleteLearningResultsByItemId
} from "./tests-module/results-db.js";
import { chemistryRouter } from "./chemistry/routes.js";
import { universalAiRouter } from "./ai-solver/routes.js";
import { deleteAiSolutionHistoryForUser } from "./ai-solver/history.js";

import {
  db,
  publicUser,
  registerUser,
  authenticateUser,
  createSession,
  destroySession,
  loadCurrentUser,
  requireAuth,
  requireAdmin,
  requireSuperAdmin,
  requireSameOrigin,
  createInitialAdmin,
  hashPassword,
  initAuthDatabase
} from "./auth.js";
import { initSchoolSystemDatabase, installSchoolSystemRoutes, saveTeacherAssignments } from "./school-system.js";

const __earlyDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__earlyDir, ".env"), override: true });
dotenv.config({ path: path.resolve(__earlyDir, "..", ".env") });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function createR2Key(folder, fileId, originalName) {
  const extension = path.extname(originalName).toLowerCase();
  const safeId = String(fileId).replace(/[^a-zA-Z0-9_-]/g, "_");

  return (
    `${folder}/${new Date().getUTCFullYear()}/` +
    `${Date.now()}-${crypto.randomUUID()}-${safeId}${extension}`
  );
}

async function ensureR2Columns() {
  for (const [tableName, columnName] of [
    ["documents", "r2_key"],
    ["document_submissions", "r2_key"],
    ["document_submissions", "answer_key_r2_key"],
    ["answer_keys", "r2_key"]
  ]) {
    try {
      await db.exec(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${columnName} TEXT`);
    } catch {}
  }
}

function getLocalFallbackBuffer(row, blobColumn = "file_data") {
  if (!row) return null;
  if (row[blobColumn]) return Buffer.from(row[blobColumn]);
  if (row.filename) {
    for (const dir of [documentsDir, pendingDir]) {
      const candidate = path.join(dir, path.basename(row.filename));
      if (fs.existsSync(candidate)) return fs.readFileSync(candidate);
    }
  }
  return null;
}

async function getDocumentBuffer(row, keyColumn = "r2_key", blobColumn = "file_data") {
  if (!row) return null;
  if (row[keyColumn]) {
    try {
      const object = await readFromR2(row[keyColumn]);
      if (object?.Body) {
        return Buffer.from(await object.Body.transformToByteArray());
      }
    } catch (error) {
      console.warn(`[R2] Could not read ${row[keyColumn]} from R2, checking fallback storage:`, error.message);
    }
    const fallback = getLocalFallbackBuffer(row, blobColumn);
    if (fallback) {
      const name = row.original_name || row.filename || "file.bin";
      await uploadToR2({
        key: row[keyColumn],
        body: fallback,
        contentType: row.content_type || contentTypeFor(name)
      }).catch((err) => console.warn("[R2] Could not restore missing R2 object from fallback:", err.message));
      return fallback;
    }
    return null;
  }
  return getLocalFallbackBuffer(row, blobColumn);
}

async function migrateFilesToR2() {
  await ensureR2Columns();
  const migration = "r2-object-keys-v1";
  const tasks = [
    {
      table: "documents",
      id: "id",
      key: "r2_key",
      blob: "file_data",
      name: "original_name",
      type: "content_type",
      folder: "documents",
      hasFilename: true
    },
    {
      table: "document_submissions",
      id: "id",
      key: "r2_key",
      blob: "file_data",
      name: "original_name",
      type: "content_type",
      folder: "pending",
      hasFilename: true
    },
    {
      table: "answer_keys",
      id: "document_id",
      key: "r2_key",
      blob: "file_data",
      name: "original_name",
      type: "content_type",
      folder: "answer-keys",
      hasFilename: false
    }
  ];
  for (const task of tasks) {
    const filenameSelect = task.hasFilename ? ", filename" : "";
    const rows = await db
      .prepare(
        `SELECT ${task.id} AS row_id, ${task.key} AS object_key, ${task.blob} AS data, ${task.name} AS original_name, ${task.type} AS content_type${filenameSelect} FROM ${task.table} WHERE ${task.key} IS NULL OR ${task.key} = ''`
      )
      .all();
    for (const row of rows) {
      const bodyBuffer = getLocalFallbackBuffer(row, "data");
      if (!bodyBuffer || !bodyBuffer.length) continue;
      try {
        const key = createR2Key(task.folder, row.row_id, row.original_name || "file.bin");
        await uploadToR2({
          key,
          body: bodyBuffer,
          contentType: row.content_type || contentTypeFor(row.original_name || "")
        });
        await db.prepare(`UPDATE ${task.table} SET ${task.key}=? WHERE ${task.id}=?`).run(key, row.row_id);
        console.info(
          "[R2] migrated existing file to R2",
          JSON.stringify({ table: task.table, id: String(row.row_id), key })
        );
      } catch (error) {
        console.warn(`[R2] Could not migrate ${task.table} (${row.row_id}) to R2:`, error.message);
      }
    }
  }
  const answers = await db
    .prepare(
      "SELECT id, answer_key_data, answer_key_r2_key, answer_key_original_name, answer_key_content_type FROM document_submissions WHERE (answer_key_r2_key IS NULL OR answer_key_r2_key = '') AND answer_key_data IS NOT NULL"
    )
    .all();
  for (const row of answers) {
    try {
      const key = createR2Key("pending-answer-keys", row.id, row.answer_key_original_name || "answer-key.bin");
      await uploadToR2({
        key,
        body: Buffer.from(row.answer_key_data),
        contentType: row.answer_key_content_type || contentTypeFor(row.answer_key_original_name || "")
      });
      await db.prepare("UPDATE document_submissions SET answer_key_r2_key=? WHERE id=?").run(key, row.id);
    } catch (error) {
      console.warn(`[R2] Could not migrate pending answer key (${row.id}) to R2:`, error.message);
    }
  }
  await db.prepare("INSERT OR IGNORE INTO app_migrations(name) VALUES(?)").run(migration);
}

function isSubjectEnabled(subject) {
  try {
    const catalog = JSON.parse(fs.readFileSync(path.join(root, "configs", "subjects.json"), "utf8"));
    return (catalog.subjects || []).some(
      (item) => item.enabled === true && normalizeSubjectName(item.name) === normalizeSubjectName(subject)
    );
  } catch (error) {
    console.error("Could not load subject catalog:", error.message);
    return false;
  }
}

function normalizeSubjectName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleLowerCase("vi")
    .replace(/[^a-z0-9]/g, "");
}

function assessmentConfigFor(subject, category) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(root, "configs", "exam-layouts.json"), "utf8"));
    const normalize = (value) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[đĐ]/g, "d")
        .toLocaleLowerCase("vi")
        .replace(/[^a-z0-9]/g, "");
    const match = Object.keys(config.subjects || {}).find((name) => normalize(name) === normalize(subject));
    const subjectConfig = match ? config.subjects[match] : null;
    if (!subjectConfig) return null;
    const lookupCat = category === "test" ? "exam" : category;
    return {
      layout: subjectConfig[lookupCat] || subjectConfig.assessment || null,
      grading: subjectConfig.grading || null
    };
  } catch (error) {
    console.error("Could not load assessment grading config:", error.message);
    return null;
  }
}

export const app = express();
app.set("trust proxy", 1);

// Wrap Express 4 route registration methods so async handlers automatically forward rejections to next(err)
for (const method of ["get", "post", "put", "delete", "patch"]) {
  const original = app[method].bind(app);
  app[method] = (routePath, ...handlers) => {
    const wrapped = handlers.map((fn) => {
      if (typeof fn !== "function" || fn.length === 4) return fn;
      return function asyncRouteWrapper(req, res, next) {
        try {
          const maybePromise = fn(req, res, next);
          if (maybePromise && typeof maybePromise.catch === "function") {
            maybePromise.catch(next);
          }
        } catch (err) {
          next(err);
        }
      };
    });
    return original(routePath, ...wrapped);
  };
}

export const server = http.createServer(app);

const port = Number(process.env.PORT || 3000);

const uploadsDir = path.join(root, "uploads");
const pendingDir = path.join(uploadsDir, "pending");
const documentsDir = path.join(uploadsDir, "documents");

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(pendingDir, { recursive: true });
fs.mkdirSync(documentsDir, { recursive: true });

async function notifyUser(userId, type, title, message, link = null) {
  await db
    .prepare("INSERT INTO notifications(user_id,type,title,message,link) VALUES(?,?,?,?,?)")
    .run(userId, type, title, message, link);
}

async function notifyAdmins(type, title, message, link = null) {
  const admins = await db.prepare("SELECT id FROM users WHERE role='admin'").all();
  for (const a of admins) {
    await notifyUser(a.id, type, title, message, link);
  }
}

async function notifyAdminsOnce(type, title, message, link = null) {
  const admins = await db.prepare("SELECT id FROM users WHERE role='admin'").all();
  for (const admin of admins) {
    const existing = await db.prepare(
      "SELECT id FROM notifications WHERE user_id=? AND type=? AND message=? " +
      "AND created_at >= datetime('now','-10 minutes') LIMIT 1"
    ).get(admin.id, type, message);
    if (!existing) await notifyUser(admin.id, type, title, message, link);
  }
}

let testsModule = null;
const activeSolutionJobs = new Set();

function examSolverConfig() {
  return {
    provider: "gemini",
    apiKey: String(process.env.GEMINI_API_KEY || "").trim(),
    modelName: String(
      process.env.GEMINI_SOLUTION_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash"
    ).trim()
  };
}

async function updateSolutionJob(documentId, values) {
  const fields = Object.keys(values);
  if (!fields.length) return;
  await db
    .prepare(
      `UPDATE exam_solutions SET ${fields.map((field) => `${field}=?`).join(",")},updated_at=datetime('now') WHERE document_id=?`
    )
    .run(...fields.map((field) => values[field]), documentId);
}

function queueExamSolution(documentId) {
  const id = String(documentId);
  if (activeSolutionJobs.has(id)) return;
  activeSolutionJobs.add(id);
  setImmediate(async () => {
    let solver = examSolverConfig();
    let documentTitle = id;
    try {
      const doc = await db
        .prepare(
          `SELECT d.id,d.title,d.subject,d.category,d.original_name,d.file_data,d.r2_key,t.questions_json AS test_questions_json,ak.normalized_json AS reference_answer_json,ak.original_name AS reference_answer_name FROM documents d LEFT JOIN tests t ON t.id=d.id LEFT JOIN answer_keys ak ON ak.document_id=d.id WHERE d.id=?`
        )
        .get(id);
      if (!doc || !["exam", "practice", "test"].includes(doc.category)) return;
      documentTitle = doc.title || id;
      const state = await db.prepare("SELECT status FROM exam_solutions WHERE document_id=?").get(id);
      if (!state || !["queued", "reading", "solving"].includes(state.status)) return;
      if (!solver.apiKey) {
        const message = "Thiếu GEMINI_API_KEY. Hãy cấu hình server/.env rồi thử lại.";
        await updateSolutionJob(id, {
          status: "failed",
          progress: 0,
          phase: "Thiếu API key",
          model: solver.modelName,
          error_code: "missing_api_key",
          error_message: message
        });
        await notifyAdmins("exam_solution_failed", "Không thể giải đề bằng Gemini", `${doc.title}: ${message}`, "admin");
        return;
      }
      const bytes = await getDocumentBuffer(doc);
      if (!bytes) throw new Error("Không tìm thấy file đề trên R2 hoặc kho lưu trữ cũ.");
      const cfg = assessmentConfigFor(doc.subject, doc.category);
      let referenceAnswerKey = null;
      try {
        referenceAnswerKey = JSON.parse(doc.reference_answer_json || "null");
      } catch {}
      let customTargets = null;
      if (doc.category === "test" && doc.test_questions_json) {
        try {
          const parsed = JSON.parse(doc.test_questions_json);
          if (Array.isArray(parsed) && parsed.length) customTargets = parsed;
        } catch {}
      }
      await updateSolutionJob(id, {
        status: "reading",
        progress: 10,
        phase: "Đang đọc đề",
        error_code: null,
        error_message: null,
        model: solver.modelName
      });
      const hash = crypto.createHash("sha256").update(bytes).digest("hex");
      await updateSolutionJob(id, {
        status: "solving",
        progress: 25,
        phase: `${solver.provider} đang giải từng câu`,
        source_hash: hash
      });
      const solution = await solveExamDocument({
        buffer: bytes,
        filename: doc.original_name,
        title: doc.title,
        layout: cfg?.layout,
        grading: cfg?.grading,
        customTargets,
        referenceAnswerKey,
        provider: solver.provider,
        modelName: solver.modelName,
        baseUrl: solver.baseUrl,
        apiKey: solver.apiKey
      });
      await updateSolutionJob(id, {
        status: "review",
        progress: 100,
        phase: "Chờ admin đối chiếu và duyệt",
        model: solution.model,
        generated_json: JSON.stringify(solution),
        generated_at: new Date().toISOString(),
        error_code: null,
        error_message: null
      });
      await notifyAdmins(
        "exam_solution_review",
        "Đề đã có lời giải AI chờ duyệt",
        `${doc.title}: AI đã tạo ${solution.answerCount}/${solution.requiredCount} đáp án. Hãy đối chiếu và duyệt trước khi mở chấm.`,
        "admin"
      );
    } catch (error) {
      const rawErrorMessage = String(error?.message || "");
      const insufficient =
          error?.code === "insufficient_balance" ||
          /insufficient balance/i.test(rawErrorMessage),
        serviceUnavailable =
          /\b503\b|service unavailable|high demand|temporarily unavailable|temporarily overloaded/i.test(rawErrorMessage) ||
          Number(error?.status || error?.statusCode) === 503,
        quota = isAIQuotaError(error) && !insufficient && !serviceUnavailable,
        network = /fetch failed|network|econnreset|enotfound|eai_again|timeout|socket/i.test(rawErrorMessage);
      const message = serviceUnavailable
        ? `${solver.provider} đang quá tải tạm thời (HTTP 503). Vui lòng thử lại sau ít phút.`
        : quota
          ? `${solver.provider} đã hết quota hoặc bị giới hạn lượt gọi.`
          : insufficient
            ? `Số dư API ${solver.provider} không đủ; hãy nạp số dư và thử lại.`
            : network
              ? `Không kết nối được ${solver.provider} API. Hãy kiểm tra kết nối và thử lại sau.`
              : String(rawErrorMessage || "Không thể tạo lời giải AI.").slice(0, 400);
      const notificationType = serviceUnavailable
        ? "ai_provider_unavailable"
        : quota || insufficient ? "ai_quota_exhausted" : "exam_solution_failed";
      const notificationTitle = serviceUnavailable
        ? `${solver.provider} tạm thời quá tải`
        : quota || insufficient
          ? `${solver.provider} cần kiểm tra hạn mức API`
          : "Không thể tạo lời giải AI";
      const notificationMessage = `${documentTitle}: ${message}`;
      await updateSolutionJob(id, {
        status: "failed",
        progress: 0,
        phase: serviceUnavailable
          ? `${solver.provider} tạm thời quá tải`
          : quota
            ? `${solver.provider} hết quota`
            : insufficient
              ? `${solver.provider} thiếu số dư`
              : network
                ? `Mất kết nối ${solver.provider}`
                : "Không tạo được lời giải",
        error_code: error?.code || (serviceUnavailable ? "provider_unavailable" : quota ? "quota_exhausted" : "solution_generation_failed"),
        error_message: message
      }).catch(() => {});
      await notifyAdminsOnce(
        notificationType,
        notificationTitle,
        notificationMessage,
        "admin"
      ).catch(() => {});
      if ((quota || insufficient) && !serviceUnavailable) {
        emailAdmins(`MAI HOC: ${solver.provider} cần kiểm tra API`, `${id}: ${message}`).catch(() => {});
      }
      // Keep raw provider diagnostics in server logs, not in user-facing notifications.
      console.error("[ExamSolution] Failed:", rawErrorMessage || error);
    } finally {
      activeSolutionJobs.delete(id);
    }
  });
}

async function createExamSolutionJob(documentId) {
  await db
    .prepare(`
      INSERT INTO exam_solutions(document_id,status,progress,phase,solution_version)
      VALUES(?,'queued',2,'Đang chờ xử lý',1)
      ON CONFLICT(document_id) DO UPDATE SET status='queued',progress=2,phase='Đang chờ xử lý',
        generated_json=NULL,approved_json=NULL,error_code=NULL,error_message=NULL,source_hash=NULL,
        solution_version=exam_solutions.solution_version+1,generated_at=NULL,approved_at=NULL,approved_by=NULL,updated_at=datetime('now')
    `)
    .run(String(documentId));
  queueExamSolution(documentId);
}

async function emailAdmins(subject, textBody) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, ADMIN_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !ADMIN_EMAIL) {
    console.warn("SMTP chưa cấu hình; bỏ qua email thông báo Admin.");
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT || 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: ADMIN_EMAIL,
    subject,
    text: textBody
  });
  return true;
}

app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

app.use(express.json({ limit: "30mb" }));
app.use(loadCurrentUser);

setupChat(server, app);

// Do not expose backend source, environment files or the local account database as static assets.
app.use((req, res, next) =>
  req.path === "/server" || req.path.startsWith("/server/") || req.path.startsWith("/uploads/")
    ? res.sendStatus(404)
    : next()
);

app.use(
  "/vendor/pdfjs/cmaps",
  express.static(path.join(__dirname, "node_modules", "pdfjs-dist", "cmaps"), { maxAge: "1d" })
);
app.use(
  "/vendor/pdfjs/standard_fonts",
  express.static(path.join(__dirname, "node_modules", "pdfjs-dist", "standard_fonts"), { maxAge: "1d" })
);
app.use(
  "/vendor/pdfjs/wasm",
  express.static(path.join(__dirname, "node_modules", "pdfjs-dist", "wasm"), { maxAge: "1d" })
);
app.use(
  "/vendor/pdfjs",
  express.static(path.join(__dirname, "node_modules", "pdfjs-dist", "build"), { maxAge: "1d" })
);

app.use((req, res, next) => {
  const reqPath = req.path.toLowerCase();
  if (reqPath === "/" || reqPath.endsWith(".html")) {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
  } else if (/\.(js|css|json)$/i.test(reqPath)) {
    res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
  } else if (/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/i.test(reqPath)) {
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  }
  next();
});

app.use(express.static(path.join(root, "public"), { etag: true, lastModified: true, maxAge: "1h" }));
app.use(
  express.static(root, { extensions: ["html"], index: "index.html", etag: true, lastModified: true, maxAge: "1h" })
);

const loginAttempts = new Map();

function loginRateLimit(req, res, next) {
  const key = `${req.ip}:${String(req.body?.email || "").trim().toLowerCase()}`;
  const now = Date.now();
  let record = loginAttempts.get(key);
  if (!record || record.resetAt <= now) record = { count: 0, resetAt: now + 15 * 60 * 1000 };
  record.count += 1;
  loginAttempts.set(key, record);
  if (loginAttempts.size > 5000) {
    for (const [k, v] of loginAttempts) if (v.resetAt <= now) loginAttempts.delete(k);
  }
  if (record.count > 10) {
    return res.status(429).json({ error: "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ 15 phút." });
  }
  next();
}

// -------------------- AUTH API --------------------

app.get("/api/auth/me", (req, res) => res.json({ user: req.user || null }));

app.post("/api/auth/register", requireSameOrigin, async (req, res) => {
  try {
    const user = await registerUser(req.body || {});
    await createSession(user.id, res);
    await notifyUser(user.id, "account_created", "Tạo tài khoản thành công", "Chào mừng bạn đến với MAI HỌC.");
    res.status(201).json({ user });
  } catch (error) {
    const message = error.message || "Không thể tạo tài khoản.";
    const status = /đã được đăng ký/i.test(message) ? 409 : 400;
    res.status(status).json({ error: message });
  }
});

app.post("/api/auth/login", requireSameOrigin, loginRateLimit, async (req, res) => {
  try {
    const user = await authenticateUser(req.body?.email, req.body?.password);
    if (!user) return res.status(401).json({ error: "Email hoặc mật khẩu không chính xác." });
    loginAttempts.delete(`${req.ip}:${String(req.body?.email || "").trim().toLowerCase()}`);
    await createSession(user.id, res);
    res.json({ user });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Không thể đăng nhập lúc này." });
  }
});

app.post("/api/auth/logout", requireSameOrigin, async (req, res) => {
  await destroySession(req, res);
  res.status(204).end();
});

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

function smtpConfigFromEnv() {
  const rawUser = String(process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER || "").trim();
  const rawPass = String(
    process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || process.env.EMAIL_PASS || ""
  ).trim();
  const host = String(process.env.SMTP_HOST || (rawUser ? "smtp.gmail.com" : "")).trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const from = String(process.env.SMTP_FROM || rawUser).trim();
  const isPlaceholder =
    !host ||
    !rawUser ||
    !rawPass ||
    /your-gmail-address|your-16-character-app-password|example\.com/i.test(rawUser + " " + rawPass);
  const pass = /gmail\.com$/i.test(host) ? rawPass.replace(/\s+/g, "") : rawPass;
  return { host, port, user: rawUser, pass, from: from || rawUser, configured: !isPlaceholder };
}

function hashOtpCode(userId, purpose, code, targetEmail = "") {
  return crypto
    .createHash("sha256")
    .update(`${userId}:${purpose}:${String(code).trim()}:${String(targetEmail || "").trim().toLowerCase()}`)
    .digest("hex");
}

async function sendVerificationCodeEmail({
  toEmail,
  userName,
  code,
  purposeLabel,
  userId = null,
  extraTargetEmail = null
}) {
  const smtp = smtpConfigFromEnv();
  console.log(`[MAI HỌC OTP] Mã xác minh (${purposeLabel}) cho ${toEmail}: ${code} (hiệu lực 10 phút)`);
  if (userId) {
    try {
      await notifyUser(
        userId,
        "verification_code",
        `Mã xác minh ${purposeLabel}: ${code}`,
        `Mã xác minh gồm 6 chữ số cho thao tác "${purposeLabel}" của bạn là: ${code}. Mã có hiệu lực trong 10 phút.`
      );
    } catch {}
  }
  if (!smtp.configured) {
    return {
      sentByEmail: false,
      devCode: code,
      message: `Hệ thống đã tạo mã xác minh 6 chữ số (môi trường hiện tại chưa cấu hình SMTP Gmail trong server/.env). Mã xác minh của bạn là: ${code} (hiệu lực 10 phút).`
    };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000
    });
    const recipients = [toEmail];
    if (extraTargetEmail && extraTargetEmail.toLowerCase() !== toEmail.toLowerCase()) {
      recipients.push(extraTargetEmail);
    }
    await transporter.sendMail({
      from: smtp.from,
      to: recipients.join(", "),
      subject: `[MAI HỌC] Mã xác minh ${purposeLabel}: ${code}`,
      text: `Xin chào ${
        userName || "bạn"
      },\n\nMã xác minh 6 chữ số cho yêu cầu "${purposeLabel}" trên hệ thống MAI HỌC của bạn là: ${code}\n\nMã có hiệu lực trong 10 phút. Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.`,
      html: `<div style="font-family:Montserrat,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #d8e2ef;background:#ffffff;color:#172b45">
        <p style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:#2478c9;margin:0 0 8px">MAI HỌC LEARNING SYSTEM</p>
        <h2 style="margin:0 0 12px;font-size:20px">Xác minh: ${purposeLabel}</h2>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6">Xin chào <strong>${
          userName || "bạn"
        }</strong>, sử dụng mã gồm 6 chữ số dưới đây để hoàn tất thao tác trên MAI HỌC:</p>
        <div style="padding:16px;background:#eaf1fb;text-align:center;font-size:28px;font-weight:700;letter-spacing:6px;color:#123b70;margin:0 0 16px">${code}</div>
        <p style="margin:0;font-size:12px;color:#65758b">Mã xác minh có hiệu lực trong <strong>10 phút</strong>. Không chia sẻ mã này cho bất kỳ ai.</p>
      </div>`
    });
    return {
      sentByEmail: true,
      message: `Đã gửi mã xác minh 6 chữ số đến Gmail ${toEmail}. Vui lòng kiểm tra hộp thư (hoặc thư mục Spam).`
    };
  } catch (error) {
    console.warn("Could not send verification email via SMTP:", error.message);
    return {
      sentByEmail: false,
      devCode: code,
      message: `Không kết nối được máy chủ SMTP Gmail (${error.message}). Mã xác minh dự phòng 6 chữ số của bạn là: ${code} (hiệu lực 10 phút).`
    };
  }
}

async function issueVerificationCode({ user, purpose, purposeLabel, targetEmail = null }) {
  const now = Date.now();
  await db.prepare("DELETE FROM email_verification_codes WHERE expires_at < ?").run(now);
  const latest = await db
    .prepare("SELECT created_at FROM email_verification_codes WHERE user_id=? AND purpose=? ORDER BY id DESC LIMIT 1")
    .get(user.id, purpose);
  if (latest && now - Number(latest.created_at) < OTP_COOLDOWN_MS) {
    const retryAfter = Math.max(1, Math.ceil((OTP_COOLDOWN_MS - (now - Number(latest.created_at))) / 1000));
    const err = new Error(`Vui lòng chờ ${retryAfter} giây trước khi yêu cầu gửi mã mới.`);
    err.status = 429;
    err.retryAfter = retryAfter;
    throw err;
  }
  const code = String(crypto.randomInt(100000, 1000000));
  const normalizedTarget = String(targetEmail || user.email || "").trim().toLowerCase();
  const codeHash = hashOtpCode(user.id, purpose, code, normalizedTarget);
  await db.prepare("DELETE FROM email_verification_codes WHERE user_id=? AND purpose=?").run(user.id, purpose);
  await db
    .prepare(
      "INSERT INTO email_verification_codes(user_id,email,purpose,target_email,code_hash,expires_at,attempts,created_at) VALUES(?,?,?,?,?,?,0,?)"
    )
    .run(user.id, user.email, purpose, normalizedTarget, codeHash, now + OTP_TTL_MS, now);
  return sendVerificationCodeEmail({
    toEmail: user.email,
    userName: user.name,
    code,
    purposeLabel,
    userId: user.id,
    extraTargetEmail: purpose === "change_email" ? normalizedTarget : null
  });
}

async function consumeVerificationCode({ userId, purpose, code, targetEmail = null }) {
  const now = Date.now();
  await db.prepare("DELETE FROM email_verification_codes WHERE expires_at < ?").run(now);
  const cleanCode = String(code || "").trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    const err = new Error("Mã xác minh phải gồm đúng 6 chữ số.");
    err.status = 400;
    throw err;
  }
  const row = await db
    .prepare("SELECT * FROM email_verification_codes WHERE user_id=? AND purpose=? ORDER BY id DESC LIMIT 1")
    .get(userId, purpose);
  if (!row || Number(row.expires_at) < now) {
    const err = new Error("Mã xác minh không tồn tại hoặc đã hết hạn (10 phút). Hãy bấm Gửi mã mới.");
    err.status = 400;
    throw err;
  }
  if (Number(row.attempts) >= OTP_MAX_ATTEMPTS) {
    await db.prepare("DELETE FROM email_verification_codes WHERE id=?").run(row.id);
    const err = new Error("Bạn đã nhập sai mã quá 5 lần. Hãy yêu cầu gửi mã xác minh mới.");
    err.status = 429;
    throw err;
  }
  const expectedTarget = String(row.target_email || "").trim().toLowerCase();
  if (targetEmail && expectedTarget !== String(targetEmail).trim().toLowerCase()) {
    const err = new Error("Thông tin email xác minh không khớp với yêu cầu ban đầu. Hãy gửi mã mới.");
    err.status = 400;
    throw err;
  }
  const expectedBuffer = Buffer.from(row.code_hash, "hex");
  const actualBuffer = Buffer.from(hashOtpCode(userId, purpose, cleanCode, expectedTarget), "hex");
  const valid = expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  if (!valid) {
    const nextAttempts = Number(row.attempts) + 1;
    if (nextAttempts >= OTP_MAX_ATTEMPTS) {
      await db.prepare("DELETE FROM email_verification_codes WHERE id=?").run(row.id);
    } else {
      await db.prepare("UPDATE email_verification_codes SET attempts=? WHERE id=?").run(nextAttempts, row.id);
    }
    const err = new Error(
      `Mã xác minh không chính xác (còn ${Math.max(0, OTP_MAX_ATTEMPTS - nextAttempts)} lần thử).`
    );
    err.status = 400;
    throw err;
  }
  await db.prepare("DELETE FROM email_verification_codes WHERE id=?").run(row.id);
  return true;
}

app.post("/api/auth/forgot-password", requireSameOrigin, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: "Vui lòng nhập địa chỉ Gmail hợp lệ." });
    }
    const user = await db
      .prepare("SELECT id,name,email,role,admin_level FROM users WHERE email=? COLLATE NOCASE")
      .get(email);
    if (!user) {
      return res.status(404).json({ error: "Không tìm thấy tài khoản nào đăng ký với địa chỉ Gmail này." });
    }
    const delivery = await issueVerificationCode({
      user,
      purpose: "forgot_password",
      purposeLabel: "Khôi phục mật khẩu",
      targetEmail: user.email
    });
    return res.json({
      ok: true,
      email: user.email,
      sentByEmail: delivery.sentByEmail,
      ...(delivery.devCode ? { devCode: delivery.devCode } : {}),
      message: delivery.message
    });
  } catch (error) {
    const status = Number(error.status) || 500;
    if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
    return res.status(status).json({
      error: error.message || "Không thể gửi mã xác minh lúc này.",
      ...(error.retryAfter ? { retryAfter: error.retryAfter } : {})
    });
  }
});

app.post("/api/auth/reset-password", requireSameOrigin, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").trim();
    const password = String(req.body?.password || "");
    if (!email) return res.status(400).json({ error: "Thiếu địa chỉ email cần đặt lại mật khẩu." });
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: "Mật khẩu mới cần có từ 8 đến 128 ký tự." });
    }
    const user = await db.prepare("SELECT id,name,email FROM users WHERE email=? COLLATE NOCASE").get(email);
    if (!user) {
      return res.status(404).json({ error: "Tài khoản không tồn tại." });
    }
    await consumeVerificationCode({
      userId: user.id,
      purpose: "forgot_password",
      code,
      targetEmail: user.email
    });
    const passwordHash = await hashPassword(password);
    await db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(passwordHash, user.id);
    await db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    await notifyUser(
      user.id,
      "password_reset",
      "Mật khẩu đã được đặt lại",
      "Mật khẩu tài khoản MAI HỌC của bạn vừa được cập nhật thông qua mã xác minh Gmail."
    );
    return res.json({ ok: true, message: "Đã đổi mật khẩu thành công. Hãy đăng nhập lại bằng mật khẩu mới." });
  } catch (error) {
    const status = Number(error.status) || 400;
    return res.status(status).json({ error: error.message || "Không thể đặt lại mật khẩu." });
  }
});

// -------------------- ACCOUNT CENTER + GMAIL OTP API --------------------

function requireUserOnlyAccountCenter(req, res, next) {
  if (req.user?.role === "admin") {
    return res.status(403).json({ error: "Trung tâm tài khoản chỉ dành cho học viên (User)." });
  }
  return next();
}

app.post(
  "/api/account/send-code",
  requireSameOrigin,
  requireAuth,
  requireUserOnlyAccountCenter,
  async (req, res) => {
    try {
      const purpose = String(req.body?.purpose || "").trim();
      const allowedPurposes = {
        change_email: "Đổi địa chỉ Email",
        change_password: "Đổi mật khẩu tài khoản",
        delete_account: "Xóa vĩnh viễn tài khoản"
      };
      if (!Object.hasOwn(allowedPurposes, purpose)) {
        return res.status(400).json({ error: "Loại thao tác xác minh không hợp lệ." });
      }
      let targetEmail = req.user.email;
      if (purpose === "change_email") {
        const newEmail = String(req.body?.newEmail || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) || newEmail.length > 254) {
          return res.status(400).json({ error: "Địa chỉ Email mới không hợp lệ." });
        }
        if (newEmail === String(req.user.email).toLowerCase()) {
          return res.status(400).json({ error: "Email mới trùng với Email hiện tại của bạn." });
        }
        const existing = await db
          .prepare("SELECT id FROM users WHERE email=? COLLATE NOCASE AND id<>?")
          .get(newEmail, req.user.id);
        if (existing) {
          return res.status(409).json({ error: "Địa chỉ Email này đã được sử dụng bởi một tài khoản khác." });
        }
        targetEmail = newEmail;
      }
      if (purpose === "delete_account" && Number(req.user.adminLevel) >= 2) {
        return res.status(403).json({ error: "Tài khoản Admin cao nhất không thể tự xóa." });
      }
      const delivery = await issueVerificationCode({
        user: req.user,
        purpose,
        purposeLabel: allowedPurposes[purpose],
        targetEmail
      });
      return res.json({
        ok: true,
        email: req.user.email,
        targetEmail,
        sentByEmail: delivery.sentByEmail,
        ...(delivery.devCode ? { devCode: delivery.devCode } : {}),
        message: delivery.message
      });
    } catch (error) {
      const status = Number(error.status) || 400;
      if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
      return res.status(status).json({
        error: error.message || "Không thể gửi mã xác minh.",
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {})
      });
    }
  }
);

app.post(
  "/api/account/change-email",
  requireSameOrigin,
  requireAuth,
  requireUserOnlyAccountCenter,
  async (req, res) => {
    try {
      const newEmail = String(req.body?.newEmail || "").trim().toLowerCase();
      const code = String(req.body?.code || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) || newEmail.length > 254) {
        return res.status(400).json({ error: "Địa chỉ Email mới không hợp lệ." });
      }
      const existing = await db
        .prepare("SELECT id FROM users WHERE email=? COLLATE NOCASE AND id<>?")
        .get(newEmail, req.user.id);
      if (existing) {
        return res.status(409).json({ error: "Địa chỉ Email này đã được sử dụng bởi một tài khoản khác." });
      }
      await consumeVerificationCode({
        userId: req.user.id,
        purpose: "change_email",
        code,
        targetEmail: newEmail
      });
      await db.prepare("UPDATE users SET email=? WHERE id=?").run(newEmail, req.user.id);
      const updated = await db
        .prepare("SELECT id,name,email,role,admin_level,created_at FROM users WHERE id=?")
        .get(req.user.id);
      await notifyUser(
        req.user.id,
        "email_changed",
        "Đã thay đổi địa chỉ Email",
        `Email tài khoản của bạn đã được chuyển thành ${newEmail}.`
      );
      return res.json({
        ok: true,
        user: publicUser(updated),
        message: `Đã cập nhật Email thành ${newEmail}.`
      });
    } catch (error) {
      const status = Number(error.status) || 400;
      return res.status(status).json({ error: error.message || "Không thể đổi địa chỉ Email." });
    }
  }
);

app.post(
  "/api/account/change-password",
  requireSameOrigin,
  requireAuth,
  requireUserOnlyAccountCenter,
  async (req, res) => {
    try {
      const code = String(req.body?.code || "").trim();
      const password = String(req.body?.password || "");
      if (password.length < 8 || password.length > 128) {
        return res.status(400).json({ error: "Mật khẩu mới cần có từ 8 đến 128 ký tự." });
      }
      await consumeVerificationCode({
        userId: req.user.id,
        purpose: "change_password",
        code,
        targetEmail: req.user.email
      });
      const passwordHash = await hashPassword(password);
      await db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(passwordHash, req.user.id);
      await notifyUser(
        req.user.id,
        "password_changed",
        "Đã đổi mật khẩu",
        "Mật khẩu tài khoản của bạn đã được cập nhật thành công."
      );
      return res.json({ ok: true, message: "Đã đổi mật khẩu tài khoản thành công." });
    } catch (error) {
      const status = Number(error.status) || 400;
      return res.status(status).json({ error: error.message || "Không thể đổi mật khẩu." });
    }
  }
);

app.post(
  "/api/account/delete",
  requireSameOrigin,
  requireAuth,
  requireUserOnlyAccountCenter,
  async (req, res) => {
    try {
      const code = String(req.body?.code || "").trim();
      if (Number(req.user.adminLevel) >= 2) {
        return res.status(403).json({ error: "Không thể xóa tài khoản Admin cao nhất." });
      }
      await consumeVerificationCode({
        userId: req.user.id,
        purpose: "delete_account",
        code,
        targetEmail: req.user.email
      });
      const userId = req.user.id;
      await deleteAiSolutionHistoryForUser(userId);
      await destroySession(req, res);
      await deleteAccountPermanently(userId);
      return res.json({ ok: true, deleted: true, message: "Tài khoản của bạn đã được xóa vĩnh viễn." });
    } catch (error) {
      const status = Number(error.status) || 400;
      return res.status(status).json({ error: error.message || "Không thể xóa tài khoản." });
    }
  }
);

// -------------------- ONLINE USERS PRESENCE DASHBOARD API --------------------

async function cleanPresenceAndListOnline(now = Date.now()) {
  const cutoff = now - ONLINE_WINDOW_MS;
  await db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  await db.prepare("DELETE FROM user_presence WHERE last_seen_at < ?").run(cutoff);
  return await db
    .prepare(`
      SELECT u.id, u.name, u.role, u.admin_level AS adminLevel,
             p.last_seen_at AS lastSeenAt, p.activity
      FROM user_presence p
      JOIN users u ON u.id = p.user_id
      WHERE p.last_seen_at >= ?
        AND EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?)
      ORDER BY CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END, p.last_seen_at DESC, u.name ASC
      LIMIT 200
    `)
    .all(cutoff, now);
}

app.post("/api/presence/ping", requireSameOrigin, requireAuth, async (req, res) => {
  const now = Date.now();
  const activity = String(req.body?.activity || "Đang trực tuyến").trim().slice(0, 80) || "Đang trực tuyến";
  await db
    .prepare(
      "INSERT INTO user_presence(user_id,last_seen_at,activity) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,activity=excluded.activity"
    )
    .run(req.user.id, now, activity);
  const users = await cleanPresenceAndListOnline(now);
  res.setHeader("Cache-Control", "no-store");
  return res.json({ ok: true, onlineCount: users.length, users });
});

app.get("/api/presence/online", async (req, res) => {
  const now = Date.now();
  if (req.user?.id) {
    const activity = String(req.query?.activity || "").trim().slice(0, 80);
    if (activity) {
      await db
        .prepare(
          "INSERT INTO user_presence(user_id,last_seen_at,activity) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,activity=excluded.activity"
        )
        .run(req.user.id, now, activity);
    } else {
      await db
        .prepare(
          "INSERT INTO user_presence(user_id,last_seen_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at"
        )
        .run(req.user.id, now);
    }
  }
  const users = await cleanPresenceAndListOnline(now);
  res.setHeader("Cache-Control", "no-store");
  return res.json({ onlineCount: users.length, users });
});

// Admin information is never trusted from client-supplied role fields.

async function deleteAccountPermanently(id) {
  const pendingFiles = await db
    .prepare("SELECT filename FROM document_submissions WHERE user_id=?")
    .all(id);
  const result = await db.prepare("DELETE FROM users WHERE id=?").run(id);
  if (!result.changes) return false;
  try {
    await deleteLearningResultsByUserId(id);
  } catch {}
  for (const file of pendingFiles) {
    const storedPath = path.join(pendingDir, path.basename(file.filename));
    try {
      if (fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
    } catch (error) {
      console.error("Could not remove pending upload for deleted user:", error.message);
    }
  }
  return true;
}

app.get("/api/admin/users", requireSuperAdmin, async (req, res) => {
  const users = await db
    .prepare("SELECT id,name,email,role,admin_level,created_at FROM users ORDER BY id DESC LIMIT 500")
    .all();
  const totalRow = await db.prepare("SELECT COUNT(*) AS count FROM users").get();
  const total = Number(totalRow?.count || 0);
  const formattedUsers = users.map(user => {
    const publicAccount = publicUser(user);
    const createdAt = user.created_at ?? user.createdAt ?? null;
    return {
      ...publicAccount,
      createdAt: createdAt == null || String(createdAt).trim() === "" ? null : createdAt
    };
  });
  res.setHeader("Cache-Control", "private, no-store");
  res.json({
    users: formattedUsers,
    total,
    currentUserId: req.user.id,
    isSuperAdmin: Number(req.user.adminLevel) >= 2
  });
});

// Only the configured super admin can appoint subordinate admins.
// Existing user accounts are promoted in place; the account password and learning data remain unchanged.
app.post("/api/admin/admins", requireSameOrigin, requireSuperAdmin, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const name = String(req.body?.name || "").trim();
  const password = String(req.body?.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Email không hợp lệ." });
  }

  const existing = await db
    .prepare("SELECT id,name,email,role,admin_level,created_at FROM users WHERE email=? COLLATE NOCASE")
    .get(email);
  if (existing) {
    if (Number(existing.admin_level) >= 2) {
      return res.status(409).json({ error: "Email này thuộc Admin cấp cao nhất; không thể thêm lại." });
    }
    if (existing.role === "admin" && Number(existing.admin_level) >= 1) {
      return res.status(409).json({ error: "Tài khoản này đã là Admin cấp dưới." });
    }
    const promote = db.transaction(async () => {
      await db
        .prepare("UPDATE users SET role='admin',admin_level=1 WHERE id=? AND admin_level<2")
        .run(existing.id);
      const updated = await db
        .prepare("SELECT id,name,email,role,admin_level,created_at FROM users WHERE id=?")
        .get(existing.id);
      await notifyAdmins(
        "admin_promoted",
        "Đã nâng quyền tài khoản thành Admin cấp dưới",
        `Tài khoản ${updated.name} (${updated.email}) đã được nâng quyền; mật khẩu và dữ liệu hiện có được giữ nguyên.`,
        "admin"
      );
      return updated;
    });
    const updated = await promote();
    return res.json({
      ok: true,
      action: "promoted",
      user: publicUser(updated),
      message:
        "Đã nâng quyền tài khoản hiện có thành Admin cấp dưới. Mật khẩu và dữ liệu học tập được giữ nguyên."
    });
  }

  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({ error: "Với email chưa có tài khoản, họ tên cần từ 2 đến 80 ký tự." });
  }
  if (password.length < 8 || password.length > 128) {
    return res
      .status(400)
      .json({ error: "Với email chưa có tài khoản, mật khẩu tạm thời cần từ 8 đến 128 ký tự." });
  }
  const passwordHash = await hashPassword(password);
  let result;
  try {
    result = await db
      .prepare("INSERT INTO users(name,email,password_hash,role,admin_level) VALUES(?,?,?,'admin',1)")
      .run(name, email, passwordHash);
  } catch (error) {
    if (String(error.code || "").includes("CONSTRAINT") || error.pgCode === "23505") {
      return res
        .status(409)
        .json({ error: "Tài khoản vừa được tạo hoặc thay đổi đồng thời. Hãy tải lại danh sách rồi thử lại." });
    }
    throw error;
  }
  const created = await db
    .prepare("SELECT id,name,email,role,admin_level,created_at FROM users WHERE id=?")
    .get(result.lastInsertRowid);
  await notifyAdmins(
    "admin_created",
    "Đã tạo Admin cấp dưới",
    `Tài khoản ${name} (${email}) đã được tạo mới.`,
    "admin"
  );
  res.status(201).json({
    ok: true,
    action: "created",
    user: publicUser(created),
    message: "Đã tạo tài khoản Admin cấp dưới mới."
  });
});

// A subordinate admin may only request deletion. No account is deleted until super-admin approval.
app.delete("/api/admin/users/:id", requireSameOrigin, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "ID tài khoản không hợp lệ." });
  if (id === req.user.id) {
    return res.status(400).json({ error: "Bạn không thể gửi yêu cầu xóa chính tài khoản của mình." });
  }
  const target = await db.prepare("SELECT id,name,email,role,admin_level FROM users WHERE id=?").get(id);
  if (!target) return res.status(404).json({ error: "Không tìm thấy tài khoản." });
  if (Number(target.admin_level) >= 2) {
    return res.status(403).json({ error: "Không thể xóa tài khoản Admin cao nhất." });
  }
  if (Number(req.user.adminLevel) >= 2) {
    await deleteAiSolutionHistoryForUser(id);
    if (!(await deleteAccountPermanently(id))) {
      return res.status(404).json({ error: "Tài khoản không còn tồn tại." });
    }
    await db
      .prepare(
        "UPDATE account_deletion_requests SET status='approved',reviewed_by=?,reviewed_at=datetime('now') WHERE target_user_id=? AND status='pending'"
      )
      .run(req.user.id, id);
    const totalRow = await db.prepare("SELECT COUNT(*) AS count FROM users").get();
    return res.json({
      ok: true,
      deletedId: id,
      deleted: true,
      total: Number(totalRow?.count || 0)
    });
  }
  const pending = await db
    .prepare("SELECT id FROM account_deletion_requests WHERE target_user_id=? AND status='pending'")
    .get(id);
  if (pending) {
    return res.status(409).json({ error: "Đã có yêu cầu xóa tài khoản này đang chờ Admin cao nhất duyệt." });
  }
  const request = await db
    .prepare(`
      INSERT INTO account_deletion_requests(target_user_id,target_name,target_email,target_role,requested_by,requested_by_name)
      VALUES(?,?,?,?,?,?)
    `)
    .run(target.id, target.name, target.email, target.role, req.user.id, req.user.name);
  const superAdmins = await db
    .prepare("SELECT id FROM users WHERE role='admin' AND admin_level>=2")
    .all();
  for (const admin of superAdmins) {
    await notifyUser(
      admin.id,
      "account_deletion_request",
      "Yêu cầu xóa tài khoản",
      `${req.user.name} đề nghị xóa ${target.role === "admin" ? "Admin cấp dưới" : "User"}: ${target.name} (${target.email}). Cần bạn chấp thuận.`,
      "admin"
    );
  }
  res.status(202).json({
    ok: true,
    deleted: false,
    requestId: request.lastInsertRowid,
    message: "Yêu cầu đã gửi Admin cao nhất. Tài khoản chưa bị xóa."
  });
});

app.get("/api/admin/account-deletion-requests", requireSuperAdmin, async (req, res) => {
  const requests = await db
    .prepare(`
      SELECT id,target_user_id AS targetUserId,target_name AS targetName,target_email AS targetEmail,
        target_role AS targetRole,requested_by AS requestedBy,requested_by_name AS requestedByName,status,
        requested_at AS requestedAt FROM account_deletion_requests
      ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, id DESC LIMIT 200
    `)
    .all();
  res.json({ requests });
});

app.post(
  "/api/admin/account-deletion-requests/:id/review",
  requireSameOrigin,
  requireSuperAdmin,
  async (req, res) => {
    const requestId = Number(req.params.id),
      decision = String(req.body?.decision || "");
    if (!Number.isSafeInteger(requestId) || requestId < 1 || !["approve", "reject"].includes(decision)) {
      return res.status(400).json({ error: "Yêu cầu hoặc quyết định không hợp lệ." });
    }
    const review = await db.prepare("SELECT * FROM account_deletion_requests WHERE id=?").get(requestId);
    if (!review) return res.status(404).json({ error: "Không tìm thấy yêu cầu." });
    if (review.status !== "pending") return res.status(409).json({ error: "Yêu cầu này đã được xử lý." });
    const target = await db
      .prepare("SELECT id,name,email,role,admin_level FROM users WHERE id=?")
      .get(review.target_user_id);
    if (decision === "approve") {
      if (target && Number(target.admin_level) >= 2) {
        return res.status(403).json({ error: "Không thể xóa Admin cao nhất." });
      }
      if (target) {
        await deleteAiSolutionHistoryForUser(target.id);
        await deleteAccountPermanently(target.id);
      }
      await db
        .prepare(
          "UPDATE account_deletion_requests SET status='approved',reviewed_by=?,reviewed_at=datetime('now') WHERE id=? AND status='pending'"
        )
        .run(req.user.id, requestId);
      if (review.requested_by) {
        await notifyUser(
          review.requested_by,
          "account_deletion_approved",
          "Yêu cầu xóa đã được duyệt",
          `Yêu cầu xóa tài khoản ${review.target_name} đã được chấp thuận và thực hiện.`,
          "admin"
        );
      }
      return res.json({ ok: true, status: "approved", deleted: Boolean(target) });
    }
    await db
      .prepare(
        "UPDATE account_deletion_requests SET status='rejected',reviewed_by=?,reviewed_at=datetime('now') WHERE id=? AND status='pending'"
      )
      .run(req.user.id, requestId);
    if (review.requested_by) {
      await notifyUser(
        review.requested_by,
        "account_deletion_rejected",
        "Yêu cầu xóa bị từ chối",
        `Yêu cầu xóa tài khoản ${review.target_name} đã bị từ chối. Tài khoản vẫn được giữ nguyên.`,
        "admin"
      );
    }
    res.json({ ok: true, status: "rejected", deleted: false });
  }
);

// -------------------- NOTIFICATIONS + LEARNING PROGRESS --------------------

app.get("/api/notifications", requireAuth, async (req, res) => {
  const items = await db
    .prepare(
      "SELECT id,type,title,message,link,read_at AS readAt,created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 60"
    )
    .all(req.user.id);
  const unreadRow = await db
    .prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL")
    .get(req.user.id);
  res.json({ items, unread: Number(unreadRow?.n || 0) });
});

app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
  await db
    .prepare("UPDATE notifications SET read_at=datetime('now') WHERE id=? AND user_id=?")
    .run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
  await db
    .prepare("UPDATE notifications SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL")
    .run(req.user.id);
  res.json({ ok: true });
});

app.delete("/api/notifications", requireSameOrigin, requireAuth, async (req, res) => {
  const result = await db.prepare("DELETE FROM notifications WHERE user_id=?").run(req.user.id);
  return res.json({ ok: true, deleted: result.changes, unread: 0 });
});

app.get("/api/admin/progress", requireSuperAdmin, async (req, res) => {
  const subordinateAdmin = Number(req.user.adminLevel) < 2;
  const rows = await db
    .prepare(`
      SELECT p.id,u.name AS userName,u.email AS userEmail,p.item_type AS itemType,
        p.item_id AS itemId,p.item_title AS itemTitle,p.subject,p.grade,p.status,
        p.progress_percent AS progressPercent,p.score,p.updated_at AS updatedAt,
        CASE WHEN p.item_type IN ('exam','test') THEN (
          SELECT a.id FROM exam_attempts a
          WHERE a.user_id=p.user_id AND a.document_id=p.item_id
          ORDER BY a.id DESC LIMIT 1
        ) ELSE NULL END AS latestAttemptId,
        CASE WHEN p.item_type='test' THEN (
          SELECT ts.id FROM test_submissions ts
          WHERE ts.user_id=p.user_id AND ts.test_id=p.item_id
          ORDER BY ts.id DESC LIMIT 1
        ) ELSE NULL END AS testSubmissionId,
        CASE WHEN p.item_type='test' THEN (
          SELECT ts.grading_status FROM test_submissions ts
          WHERE ts.user_id=p.user_id AND ts.test_id=p.item_id
          ORDER BY ts.id DESC LIMIT 1
        ) ELSE NULL END AS gradingStatus
      FROM user_progress p
      JOIN users u ON u.id=p.user_id
      LEFT JOIN tests owned_test ON owned_test.id=p.item_id AND p.item_type='test'
      ${subordinateAdmin ? "WHERE (p.item_type <> 'test' OR owned_test.created_by = ?)" : ""}
      ORDER BY p.updated_at DESC
      LIMIT 300
    `)
    .all(...(subordinateAdmin ? [req.user.id] : []));
  res.json({ progress: rows });
});

app.get("/api/progress", requireAuth, async (req, res) => {
  const rows = await db
    .prepare(
      "SELECT p.id,p.item_type AS itemType,p.item_id AS itemId,p.item_title AS itemTitle,p.subject,p.grade,p.status,p.progress_percent AS progressPercent,p.score,p.answers_json AS answers,p.last_position AS lastPosition,p.started_at AS startedAt,p.updated_at AS updatedAt,CASE WHEN p.item_type IN ('exam','test') THEN (SELECT a.id FROM exam_attempts a WHERE a.user_id=p.user_id AND a.document_id=p.item_id ORDER BY a.id DESC LIMIT 1) ELSE NULL END AS latestAttemptId,CASE WHEN p.item_type='test' THEN (SELECT ts.id FROM test_submissions ts WHERE ts.user_id=p.user_id AND ts.test_id=p.item_id ORDER BY ts.id DESC LIMIT 1) ELSE NULL END AS testSubmissionId,CASE WHEN p.item_type='test' THEN (SELECT ts.grading_status FROM test_submissions ts WHERE ts.user_id=p.user_id AND ts.test_id=p.item_id ORDER BY ts.id DESC LIMIT 1) ELSE NULL END AS gradingStatus FROM user_progress p WHERE p.user_id=? ORDER BY p.updated_at DESC"
    )
    .all(req.user.id);
  res.json({ progress: rows });
});

app.put("/api/progress", requireSameOrigin, requireAuth, async (req, res) => {
  const b = req.body || {},
    type = String(b.itemType || ""),
    id = String(b.itemId || "");
  if (!["lesson", "document", "exam", "practice", "test"].includes(type) || !id || id.length > 180) {
    return res.status(400).json({ error: "Loại hoặc ID nội dung không hợp lệ." });
  }

  const requestedPercent = Math.max(0, Math.min(100, Math.round(Number(b.progressPercent) || 0)));
  const previous = await db
    .prepare("SELECT progress_percent AS progressPercent,status FROM user_progress WHERE user_id=? AND item_type=? AND item_id=?")
    .get(req.user.id, type, id);
  const percent =
    previous?.status === "completed" ? 100 : Math.max(Number(previous?.progressPercent || 0), requestedPercent);
  const wantsCompletion = b.status === "completed" && percent === 100;
  const status = wantsCompletion ? "completed" : previous?.status === "completed" ? "completed" : "in_progress";
  const document = await db.prepare("SELECT title,subject,grade FROM documents WHERE id=?").get(id);
  const itemTitle = String(b.itemTitle || document?.title || id).trim().slice(0, 180) || id;
  const resolvedSubject = String(b.subject || document?.subject || "Toán").slice(0, 60);
  const resolvedGrade = String(b.grade || document?.grade || "10").slice(0, 5);
  const answers = b.answers == null ? null : JSON.stringify(b.answers).slice(0, 50000);

  await db
    .prepare(`
      INSERT INTO user_progress(user_id,item_type,item_id,item_title,subject,grade,status,progress_percent,score,answers_json,last_position,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(user_id,item_type,item_id) DO UPDATE SET item_title=excluded.item_title,subject=excluded.subject,grade=excluded.grade,status=excluded.status,progress_percent=excluded.progress_percent,score=COALESCE(excluded.score,user_progress.score),answers_json=COALESCE(excluded.answers_json,user_progress.answers_json),last_position=excluded.last_position,updated_at=datetime('now')
    `)
    .run(
      req.user.id,
      type,
      id,
      itemTitle,
      resolvedSubject,
      resolvedGrade,
      status,
      percent,
      Number.isFinite(Number(b.score)) && b.score !== "" ? Number(b.score) : null,
      answers,
      String(b.lastPosition || percent).slice(0, 300)
    );

  let notificationCreated = false;
  if (wantsCompletion && previous?.status !== "completed") {
    const notificationType = type === "exam" ? "exam_completed" : "lesson_completed";
    await notifyUser(req.user.id, notificationType, `Đã hoàn thành ${itemTitle}`, `Bạn đã hoàn thành ${itemTitle}.`);
    notificationCreated = true;
  } else if (
    !wantsCompletion &&
    Math.floor(percent / 10) > Math.floor(Number(previous?.progressPercent || 0) / 10)
  ) {
    await notifyUser(
      req.user.id,
      "learning_progress",
      `Tiến trình học ${percent}% cho ${itemTitle}`,
      `${itemTitle} đã đạt ${percent}%.`
    );
    notificationCreated = true;
  }

  res.json({ ok: true, progressPercent: percent, status, notificationCreated });
});

app.post("/api/exams/:id/submit", requireSameOrigin, async (req, res) => {
  const document = await db
    .prepare(
      "SELECT d.id,d.title,d.subject,d.grade,d.category,ak.file_data AS answerKeyData,ak.original_name AS answerKeyOriginalName,ak.normalized_json AS normalizedAnswerKey,ak.normalization_error AS answerKeyNormalizationError,es.status AS solutionStatus,es.approved_json AS approvedSolution,es.generated_json AS generatedSolution FROM documents d LEFT JOIN answer_keys ak ON ak.document_id=d.id LEFT JOIN exam_solutions es ON es.document_id=d.id WHERE d.id=?"
    )
    .get(String(req.params.id));
  if (!document || !["practice", "exam"].includes(document.category)) {
    return res.status(404).json({ error: "Exam or practice document was not found." });
  }
  const rawAnswers = req.body?.answers;
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
    return res.status(400).json({ error: "Submit answers as a question-to-answer object." });
  }
  const answers = Object.fromEntries(
    Object.entries(rawAnswers)
      .slice(0, 200)
      .map(([question, value]) => [String(question).slice(0, 40), String(value ?? "").slice(0, 5000)])
  );

  const assessmentConfig = assessmentConfigFor(document.subject, document.category);
  let answerKey = null;
  if (document.approvedSolution) {
    try {
      const approved = JSON.parse(document.approvedSolution);
      if (approved?.answers && Object.keys(approved.answers).length) {
        answerKey = { answers: approved.answers, points: approved.points || {} };
      }
    } catch {}
  }
  if (!answerKey && document.normalizedAnswerKey) {
    try {
      const parsed = JSON.parse(document.normalizedAnswerKey);
      if (parsed?.answers && Object.keys(parsed.answers).length) answerKey = parsed;
    } catch {}
  }
  if (!answerKey && document.answerKeyData) {
    answerKey = await normalizeAnswerKeyDocument(
      document.answerKeyData,
      document.answerKeyOriginalName,
      assessmentConfig?.layout,
      assessmentConfig?.grading
    );
    if (answerKey) {
      await db
        .prepare(
          "UPDATE answer_keys SET normalized_json=?,question_ids=?,grading_available=1,normalization_error=NULL WHERE document_id=?"
        )
        .run(JSON.stringify(answerKey), JSON.stringify(Object.keys(answerKey.answers)), document.id);
    }
  }
  if (!answerKey && document.generatedSolution) {
    try {
      const generated = JSON.parse(document.generatedSolution);
      if (
        generated?.source !== "manual-entry" &&
        Array.isArray(generated?.questions) &&
        generated.questions.length
      ) {
        const generatedAnswers = {};
        for (const q of generated.questions) {
          if (q?.targetId && String(q.answer ?? "").trim()) {
            generatedAnswers[String(q.targetId)] = String(q.answer).trim();
          }
        }
        if (Object.keys(generatedAnswers).length) {
          answerKey = { answers: generatedAnswers, points: {} };
        }
      }
    } catch {}
  }

  let waitingMessage = null;
  if (!answerKey && document.solutionStatus && document.solutionStatus !== "ready") {
    let isManualDraft = false;
    try {
      isManualDraft = JSON.parse(document.generatedSolution || "null")?.source === "manual-entry";
    } catch {}
    waitingMessage =
      document.solutionStatus === "review"
        ? isManualDraft
          ? "Đề đang chờ Giảng viên / Admin nhập và xác nhận đáp án chuẩn."
          : "Đề đã có lời giải AI và đang chờ Admin đối chiếu, duyệt đáp án chuẩn."
        : document.solutionStatus === "failed"
          ? "Chưa thể tạo lời giải chuẩn cho đề. Admin đã được thông báo và có thể thử lại."
          : "Đề đang được AI giải. Bài làm đã nhận nhưng sẽ được chấm sau khi Admin duyệt đáp án chuẩn.";
  }

  const grade = answerKey ? gradeAnswers(answerKey, answers, assessmentConfig || {}) : null;
  let resultPayload;
  if (grade && grade.completeAnswerKey !== false) {
    resultPayload = { graded: true, ...grade };
  } else if (grade && grade.matchedAnswerCount > 0) {
    resultPayload = { graded: true, ...grade };
  } else if (waitingMessage) {
    resultPayload = {
      graded: false,
      hasAnswerKey: false,
      solutionStatus: document.solutionStatus,
      message: waitingMessage
    };
  } else if (!grade) {
    resultPayload = {
      graded: false,
      hasAnswerKey: Boolean(document.answerKeyData),
      message: document.answerKeyData
        ? document.answerKeyNormalizationError ||
          "Đã nộp bài nhưng tệp đáp án chưa thể chuyển thành dữ liệu chấm điểm."
        : "Đã nộp bài. Đề này chưa có đáp án để chấm tự động."
    };
  } else {
    resultPayload = {
      graded: false,
      hasAnswerKey: true,
      ...grade,
      message:
        "Đáp án chuẩn còn thiếu " +
        grade.missingAnswerCount +
        " mục bắt buộc nên chưa thể chấm chính xác."
    };
  }

  if (req.user) {
    const saveAttempt = db.transaction(async () => {
      const previous = await db
        .prepare("SELECT status FROM user_progress WHERE user_id=? AND item_type='exam' AND item_id=?")
        .get(req.user.id, document.id);
      const inserted = await db
        .prepare(
          "INSERT INTO exam_attempts(user_id,document_id,title,subject,grade,category,graded,score,scale,percent,correct_count,question_count,answers_json,answer_key_json,result_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
        )
        .run(
          req.user.id,
          document.id,
          document.title,
          document.subject,
          document.grade,
          document.category,
          resultPayload.graded ? 1 : 0,
          resultPayload.graded
            ? Number(resultPayload.score ?? resultPayload.earnedPoints ?? resultPayload.percent)
            : null,
          resultPayload.scale == null
            ? resultPayload.totalPoints == null
              ? null
              : Number(resultPayload.totalPoints)
            : Number(resultPayload.scale),
          resultPayload.percent == null ? null : Number(resultPayload.percent),
          resultPayload.correctCount == null ? null : Number(resultPayload.correctCount),
          resultPayload.questionCount == null ? null : Number(resultPayload.questionCount),
          JSON.stringify(answers),
          answerKey ? JSON.stringify({ answers: answerKey.answers, points: answerKey.points || {} }) : null,
          JSON.stringify(resultPayload)
        );
      const attemptId = Number(inserted.lastInsertRowid);
      const fullPayload = { ...resultPayload, attemptId, saved: true };
      await db
        .prepare("UPDATE exam_attempts SET result_json=? WHERE id=?")
        .run(JSON.stringify(fullPayload), attemptId);
      const score = resultPayload.graded
        ? Number(resultPayload.score ?? resultPayload.earnedPoints ?? resultPayload.percent)
        : null;
      await db
        .prepare(
          "INSERT INTO user_progress(user_id,item_type,item_id,item_title,subject,grade,status,progress_percent,score,answers_json,last_position,updated_at) VALUES(?,'exam',?,?,?,?, 'completed',100,?,?,?,datetime('now')) ON CONFLICT(user_id,item_type,item_id) DO UPDATE SET item_title=excluded.item_title,subject=excluded.subject,grade=excluded.grade,status='completed',progress_percent=100,score=COALESCE(excluded.score,user_progress.score),answers_json=excluded.answers_json,last_position=excluded.last_position,updated_at=datetime('now')"
        )
        .run(
          req.user.id,
          document.id,
          document.title,
          document.subject,
          document.grade,
          score,
          JSON.stringify(answers),
          "result:" + attemptId
        );
      if (previous?.status !== "completed") {
        await notifyUser(
          req.user.id,
          "exam_completed",
          "Đã hoàn thành " + document.title,
          "Bạn đã hoàn thành " + document.title + "."
        );
      }
      return fullPayload;
    });
    return res.json(await saveAttempt());
  }

  return res.json(resultPayload);
});

function parseExamAttempt(row) {
  if (!row) return null;
  let result = null,
    answers = {},
    answerKey = null;
  try {
    result = JSON.parse(row.result_json || "null");
  } catch {}
  try {
    answers = JSON.parse(row.answers_json || "{}");
  } catch {}
  try {
    answerKey = JSON.parse(row.answer_key_json || "null");
  } catch {}
  return {
    id: Number(row.id),
    documentId: row.document_id,
    title: row.title,
    subject: row.subject,
    grade: row.grade,
    category: row.category,
    graded: Boolean(row.graded),
    score: row.score == null ? null : Number(row.score),
    scale: row.scale == null ? null : Number(row.scale),
    percent: row.percent == null ? null : Number(row.percent),
    answers,
    answerKey,
    result,
    createdAt: row.created_at,
    ...(row.userName ? { userName: row.userName } : {}),
    ...(row.userEmail ? { userEmail: row.userEmail } : {})
  };
}

app.get("/api/exam-results/:id", requireAuth, async (req, res) => {
  const row = await db
    .prepare("SELECT * FROM exam_attempts WHERE id=? AND user_id=?")
    .get(Number(req.params.id), req.user.id);
  if (!row) {
    return res.status(404).json({ error: "Không tìm thấy kết quả hoặc bạn không có quyền xem." });
  }
  res.setHeader("Cache-Control", "private, no-store");
  return res.json(parseExamAttempt(row));
});

app.get("/api/admin/exam-results/:id", requireAdmin, async (req, res) => {
  const row = await db
    .prepare(
      "SELECT a.*,u.name AS userName,u.email AS userEmail FROM exam_attempts a JOIN users u ON u.id=a.user_id WHERE a.id=?"
    )
    .get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Không tìm thấy kết quả." });
  res.setHeader("Cache-Control", "private, no-store");
  return res.json(parseExamAttempt(row));
});

// -------------------- DOCUMENT UPLOAD + ADMIN REVIEW --------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = new Set([
      ".pdf",
      ".doc",
      ".docx",
      ".ppt",
      ".pptx",
      ".txt",
      ".png",
      ".jpg",
      ".jpeg",
      ".json",
      ".csv"
    ]);
    cb(allowed.has(ext) ? null : new Error("Unsupported document format."), allowed.has(ext));
  }
});

function storedFilename(originalName) {
  const safe = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
}

async function saveFileToR2(folder, fileId, file) {
  const key = createR2Key(folder, fileId, file.originalname);

  try {
    const result = await uploadToR2({
      key,
      body: file.buffer,
      contentType: file.mimetype || contentTypeFor(file.originalname)
    });

    console.info(
      "[R2] upload successful",
      JSON.stringify({
        bucket: result?.bucket || process.env.R2_BUCKET_NAME || "unknown",
        key,
        bytes: file.buffer?.length || 0,
        fileId: String(fileId),
        folder
      })
    );

    return key;
  } catch (error) {
    console.error(
      "[R2] upload failed",
      JSON.stringify({
        bucket: process.env.R2_BUCKET_NAME || "unknown",
        key,
        fileId: String(fileId),
        folder,
        errorCode: error?.Code || error?.code || "R2_UPLOAD_FAILED",
        message: error?.message || "Unknown R2 upload error"
      })
    );
    throw error;
  }
}

async function getFileFromR2(key) {
  if (!key) {
    throw new Error("Không tìm thấy R2 key của tài liệu.");
  }

  const object = await readFromR2(key);

  if (!object.Body) {
    throw new Error("R2 không trả về nội dung file.");
  }

  return Buffer.from(await object.Body.transformToByteArray());
}

function documentResponse(row) {
  const fileUrl = `/api/documents/${encodeURIComponent(row.id)}/file`;
  let questionIds = [];
  try {
    questionIds = JSON.parse(row.answer_key_question_ids || "[]");
    if (!Array.isArray(questionIds)) questionIds = [];
  } catch {}
  return {
    id: row.id,
    subject: row.subject,
    grade: row.grade,
    category: row.category,
    title: row.title,
    filename: row.filename,
    originalName: row.original_name,
    size: Number(row.size),
    contentType: row.content_type,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
    hasAnswerKey: Boolean(row.answer_key_original_name),
    questionIds,
    answerKeyOriginalName: row.answer_key_original_name || null,
    url: fileUrl,
    fileUrl,
    downloadUrl: fileUrl,
    fileExists: true,
    localOnly: false
  };
}

function contentTypeFor(filename) {
  const extension = path.extname(filename).toLowerCase();
  const types = {
    ".pdf": "application/pdf",
    ".txt": "text/plain; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  };
  return types[extension] || "application/octet-stream";
}

async function saveAnswerKeyRecord(
  documentId,
  file,
  uploadedBy = null,
  normalizedOverride = undefined,
  existingR2Key = null
) {
  const name = String(file.originalname || "answer-key.txt"),
    buffer = Buffer.from(file.buffer || []);
  const normalized =
    normalizedOverride === undefined ? await normalizeAnswerKeyDocument(buffer, name) : normalizedOverride;
  const fmt = path.extname(name).slice(1).toLowerCase() || "unknown",
    key = existingR2Key || createR2Key("answer-keys", documentId, name);
  let uploadedHere = false;
  if (!existingR2Key) {
    await uploadToR2({ key, body: buffer, contentType: file.mimetype || contentTypeFor(name) });
    uploadedHere = true;
  }
  try {
    await db
      .prepare(
        `INSERT INTO answer_keys (document_id,original_name,content_type,file_data,r2_key,source_format,normalized_json,question_ids,grading_available,normalization_error,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(document_id) DO UPDATE SET original_name=excluded.original_name,content_type=excluded.content_type,file_data=excluded.file_data,r2_key=excluded.r2_key,source_format=excluded.source_format,normalized_json=excluded.normalized_json,question_ids=excluded.question_ids,grading_available=excluded.grading_available,normalization_error=excluded.normalization_error,uploaded_by=excluded.uploaded_by,uploaded_at=datetime('now')`
      )
      .run(
        documentId,
        name,
        file.mimetype || contentTypeFor(name),
        buffer,
        key,
        fmt,
        normalized ? JSON.stringify(normalized) : null,
        normalized ? JSON.stringify(Object.keys(normalized.answers)) : null,
        normalized ? 1 : 0,
        normalized ? null : "Tệp đáp án chưa được chuẩn hóa.",
        uploadedBy || null
      );
    return normalized;
  } catch (error) {
    if (uploadedHere) await deleteFromR2(key).catch(() => {});
    throw error;
  }
}

async function migrateLegacyAnswerKeys() {
  const migration = "separate-answer-key-table-v1";
  if (await db.prepare("SELECT 1 FROM app_migrations WHERE name=?").get(migration)) return;
  const rows = await db
    .prepare(
      `SELECT id,subject,category,answer_key_data,answer_key_original_name,answer_key_content_type,uploaded_by FROM documents WHERE answer_key_data IS NOT NULL`
    )
    .all();
  for (const row of rows) {
    if (await db.prepare("SELECT 1 FROM answer_keys WHERE document_id=?").get(row.id)) continue;
    const name = row.answer_key_original_name || "answer-key.txt",
      cfg = assessmentConfigFor(row.subject, row.category);
    const normalized = await normalizeAnswerKeyDocument(
      Buffer.from(row.answer_key_data),
      name,
      cfg?.layout,
      cfg?.grading
    );
    await saveAnswerKeyRecord(
      row.id,
      {
        buffer: Buffer.from(row.answer_key_data),
        originalname: name,
        mimetype: row.answer_key_content_type || contentTypeFor(name)
      },
      row.uploaded_by,
      normalized
    );
  }
  await db.prepare("INSERT OR IGNORE INTO app_migrations(name) VALUES(?)").run(migration);
}

async function normalizeStoredPdfAnswerKeys() {
  const rows = await db
    .prepare(`
      SELECT d.id,d.subject,d.category,ak.file_data,ak.r2_key,ak.original_name,ak.normalized_json
      FROM answer_keys ak JOIN documents d ON d.id=ak.document_id
      WHERE lower(ak.source_format) IN ('pdf','docx')
    `)
    .all();
  for (const row of rows) {
    let storedVersion = 0;
    try {
      storedVersion = Number(JSON.parse(row.normalized_json || "{}").normalizerVersion) || 0;
    } catch {}
    if (storedVersion >= 2) continue;
    const config = assessmentConfigFor(row.subject, row.category);
    const bytes = row.r2_key
      ? await getDocumentBuffer(row, "r2_key", "file_data")
      : row.file_data
        ? Buffer.from(row.file_data)
        : null;
    if (!bytes) continue;
    const normalized = await normalizeAnswerKeyDocument(
      bytes,
      row.original_name,
      config?.layout,
      config?.grading
    );
    if (normalized) {
      await db
        .prepare(`
          UPDATE answer_keys SET normalized_json=?,question_ids=?,grading_available=1,normalization_error=NULL
          WHERE document_id=?
        `)
        .run(JSON.stringify(normalized), JSON.stringify(Object.keys(normalized.answers)), row.id);
    } else {
      await db
        .prepare(`
          UPDATE answer_keys SET normalized_json=NULL,question_ids=NULL,grading_available=0,
            normalization_error=? WHERE document_id=?
        `)
        .run(
          path.extname(row.original_name || "").toLowerCase() === ".pdf"
            ? "Không đọc được bảng đáp án dạng văn bản trong PDF. PDF scan cần Tesseract trên máy chủ; bố cục không hỗ trợ sẽ không được chấm tự động."
            : "Tệp DOCX chưa chuyển được thành các hàng câu hỏi và đáp án.",
          row.id
        );
    }
  }
}

async function importLegacyDocuments() {
  const migrationName = "legacy-upload-index-to-sqlite-v1";
  if (await db.prepare("SELECT 1 FROM app_migrations WHERE name=?").get(migrationName)) return;
  const indexPath = path.join(uploadsDir, "index.json");
  if (!fs.existsSync(indexPath)) return;
  try {
    const entries = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    if (!Array.isArray(entries)) return;
    const insert = db.prepare(`
      INSERT OR IGNORE INTO documents
      (id,subject,grade,category,title,filename,original_name,size,content_type,file_data,uploaded_by,uploaded_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,COALESCE(?,datetime('now')))
    `);
    for (const entry of entries) {
      if (!entry?.id || !entry.filename) continue;
      if (await db.prepare("SELECT 1 FROM documents WHERE id=?").get(String(entry.id))) continue;
      const source = path.join(uploadsDir, path.basename(entry.filename));
      if (!fs.existsSync(source)) continue;
      const fileData = fs.readFileSync(source);
      const filename = storedFilename(entry.originalName || entry.filename);
      fs.copyFileSync(source, path.join(documentsDir, filename), fs.constants.COPYFILE_EXCL);
      await insert.run(
        String(entry.id),
        String(entry.subject || "Toan"),
        String(entry.grade || "10"),
        String(entry.category || "theory"),
        String(entry.title || entry.originalName || "Document"),
        filename,
        String(entry.originalName || entry.filename),
        fileData.length,
        contentTypeFor(entry.originalName || entry.filename),
        fileData,
        entry.uploadedBy || null,
        entry.uploadedAt || null
      );
    }
    await db.prepare("INSERT OR IGNORE INTO app_migrations(name) VALUES(?)").run(migrationName);
  } catch (error) {
    console.error("Could not import legacy uploaded documents:", error.message);
  }
}

async function normalizeLegacyDocumentCategories() {
  const migrationName = "legacy-practice-title-category-v1";
  if (await db.prepare("SELECT 1 FROM app_migrations WHERE name=?").get(migrationName)) return;
  const rows = await db.prepare("SELECT id,title FROM documents WHERE category='exam'").all();
  const update = db.prepare("UPDATE documents SET category='practice' WHERE id=?");
  const migrate = db.transaction(async () => {
    for (const row of rows) {
      const normalized = String(row.title)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replaceAll(String.fromCharCode(273), "d")
        .replaceAll(String.fromCharCode(272), "d")
        .toLowerCase();
      if (/\b(on tap|luyen tap)\b/.test(normalized)) await update.run(row.id);
    }
    await db.prepare("INSERT OR IGNORE INTO app_migrations(name) VALUES(?)").run(migrationName);
  });
  await migrate();
}

app.post(
  "/api/documents",
  requireSameOrigin,
  requireAuth,
  upload.fields([
    { name: "document", maxCount: 1 },
    { name: "answerKey", maxCount: 1 }
  ]),
  async (req, res, next) => {
    const file = req.files?.document?.[0],
      answer = req.files?.answerKey?.[0],
      keys = [];
    let createdLocalPath = null;
    try {
      if (!file) return res.status(400).json({ error: "No document was received." });
      const b = req.body || {},
        cat = String(b.category || "");
      if (!new Set(["theory", "practice", "exam", "exercise", "answer"]).has(cat)) {
        return res.status(400).json({ error: "Choose a valid document category." });
      }
      if (
        answer &&
        !new Set([".pdf", ".docx", ".txt", ".json", ".csv"]).has(
          path.extname(answer.originalname).toLowerCase()
        )
      ) {
        return res.status(400).json({ error: "Invalid answer key format." });
      }
      if (
        !new Set([".pdf", ".doc", ".docx", ".ppt", ".pptx", ".txt", ".png", ".jpg", ".jpeg"]).has(
          path.extname(file.originalname).toLowerCase()
        )
      ) {
        return res.status(400).json({ error: "Unsupported question document format." });
      }
      if (answer && !["practice", "exam"].includes(cat)) {
        return res
          .status(400)
          .json({ error: "Answer keys can only be attached to practice and mock exam documents." });
      }
      const subject = String(b.subject || "Toán"),
        grade = String(b.grade || "10"),
        title = String(b.title || file.originalname).slice(0, 120),
        admin = req.user.role === "admin";
      if (!isSubjectEnabled(subject)) {
        return res.status(400).json({ error: "Môn học chưa được kích hoạt trong configs/subjects.json." });
      }
      const id = admin ? `upload-${Date.now()}-${crypto.randomBytes(4).toString("hex")}` : null,
        storageId = id || `submission-user-${req.user.id}-${crypto.randomUUID()}`;
      const fileKey = await saveFileToR2(admin ? "documents" : "pending", storageId, file);
      keys.push(fileKey);
      let answerKey = null,
        norm = null;
      if (answer) {
        const cfg = assessmentConfigFor(subject, cat);
        norm = await normalizeAnswerKeyDocument(answer.buffer, answer.originalname, cfg?.layout, cfg?.grading);
        answerKey = await saveFileToR2(admin ? "answer-keys" : "pending-answer-keys", storageId, answer);
        keys.push(answerKey);
      }
      const filename = storedFilename(file.originalname),
        ct = file.mimetype || contentTypeFor(file.originalname);
      createdLocalPath = path.join(admin ? documentsDir : pendingDir, filename);
      if (!fs.existsSync(createdLocalPath)) {
        fs.writeFileSync(createdLocalPath, file.buffer, { flag: "wx" });
      }
      if (admin) {
        const saveAdminDocTx = db.transaction(async () => {
          await db
            .prepare(
              `INSERT INTO documents (id,subject,grade,category,title,filename,original_name,size,content_type,file_data,r2_key,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
            )
            .run(
              id,
              subject,
              grade,
              cat,
              title,
              filename,
              file.originalname,
              file.size,
              ct,
              file.buffer,
              fileKey,
              req.user.id
            );
          if (answer) {
            const name = answer.originalname,
              fmt = path.extname(name).slice(1).toLowerCase() || "unknown";
            await db
              .prepare(
                `INSERT INTO answer_keys (document_id,original_name,content_type,file_data,r2_key,source_format,normalized_json,question_ids,grading_available,normalization_error,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`
              )
              .run(
                id,
                name,
                answer.mimetype || contentTypeFor(name),
                answer.buffer,
                answerKey,
                fmt,
                norm ? JSON.stringify(norm) : null,
                norm ? JSON.stringify(Object.keys(norm.answers)) : null,
                norm ? 1 : 0,
                norm ? null : "Tệp đáp án chưa được chuẩn hóa.",
                req.user.id
              );
          }
        });
        await saveAdminDocTx();
        const answerMode = String(b.answerMode || "immediate").trim() === "deferred" ? "deferred" : "immediate";
        const answerEntryMethod = String(b.answerEntryMethod || "manual").trim() === "ai" ? "ai" : "manual";
        const hasJob = ["exam", "practice"].includes(cat);
        let solutionJob = null;
        if (hasJob && answerMode === "immediate") {
          if (answerEntryMethod === "ai") {
            await createExamSolutionJob(id);
            solutionJob = {
              id,
              status: "queued",
              mode: "ai",
              preferredMode: "ai",
              progress: 2,
              phase: "Đang chờ xử lý"
            };
          } else {
            if (testsModule?.initManualSolutionForDocument) {
              await testsModule.initManualSolutionForDocument(id);
            }
            solutionJob = {
              id,
              status: "review",
              mode: "manual",
              preferredMode: "manual",
              progress: 100,
              phase: "Nhập đáp án thủ công"
            };
          }
        }
        const row = await db
          .prepare(
            `SELECT d.*,ak.original_name AS answer_key_original_name,ak.question_ids AS answer_key_question_ids FROM documents d LEFT JOIN answer_keys ak ON ak.document_id=d.id WHERE d.id=?`
          )
          .get(id);
        const message = !hasJob
          ? "Tài liệu đã được tải lên máy chủ."
          : answerMode === "deferred"
            ? "Đã tải đề lên ở chế độ Chưa nhập đáp án ngay (Có thể nhập đáp án thủ công hoặc dùng AI giải sau trong mục Quản lý đáp án)."
            : answerEntryMethod === "ai"
              ? "Đề đã tải lên. Gemini đang giải; cửa sổ tiến trình đã mở."
              : "Đề đã tải lên. Hãy nhập và xác nhận bộ đáp án chuẩn.";
        return res.status(201).json({
          document: documentResponse(row),
          r2Key: fileKey,
          status: "approved",
          localOnly: false,
          answerMode,
          answerEntryMethod,
          solutionJob,
          message
        });
      }
      const out = await db
        .prepare(
          `INSERT INTO document_submissions (user_id,subject,grade,category,title,filename,original_name,size,file_data,r2_key,content_type,answer_key_data,answer_key_r2_key,answer_key_original_name,answer_key_content_type,answer_key_question_ids) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          req.user.id,
          subject,
          grade,
          cat,
          title,
          filename,
          file.originalname,
          file.size,
          file.buffer,
          fileKey,
          ct,
          answer?.buffer || null,
          answerKey,
          answer?.originalname || null,
          answer ? answer.mimetype || contentTypeFor(answer.originalname) : null,
          norm ? JSON.stringify(Object.keys(norm.answers)) : null
        );
      await notifyAdmins(
        "document_pending",
        "Có tài liệu mới chờ duyệt",
        `${req.user.name} đã gửi tài liệu ${title}.`,
        "admin"
      );
      await notifyUser(
        req.user.id,
        "document_submitted",
        "Đã gửi tài liệu",
        `Tài liệu ${title} đã được gửi cho Admin duyệt.`
      );
      return res.status(201).json({
        submissionId: out.lastInsertRowid,
        r2Key: fileKey,
        title,
        status: "pending",
        localOnly: false
      });
    } catch (error) {
      if (createdLocalPath && fs.existsSync(createdLocalPath)) {
        try {
          fs.unlinkSync(createdLocalPath);
        } catch {}
      }
      await Promise.all(keys.map((key) => deleteFromR2(key).catch(() => {})));
      return next(error);
    }
  }
);

// -------------------- DOCUMENT LIBRARY API --------------------

app.get("/api/documents", async (req, res) => {
  const isSubordinateAdmin = req.user?.role === "admin" && Number(req.user.adminLevel) < 2;
  const sql = `
    SELECT d.id,d.subject,d.grade,d.category,d.title,d.filename,d.original_name,d.size,d.content_type,
      d.uploaded_by,d.uploaded_at,ak.original_name AS answer_key_original_name,ak.question_ids AS answer_key_question_ids
    FROM documents d LEFT JOIN answer_keys ak ON ak.document_id=d.id
    ${isSubordinateAdmin ? "WHERE d.uploaded_by=?" : ""}
    ORDER BY d.uploaded_at DESC
  `;
  const documents = isSubordinateAdmin
    ? await db.prepare(sql).all(req.user.id)
    : await db.prepare(sql).all();
  res.setHeader("Cache-Control", "private, no-store");
  res.json(documents.map(documentResponse));
});

app.get("/api/admin/answer-keys", requireAdmin, async (req, res) => {
  const isSubordinateAdmin = Number(req.user.adminLevel) < 2;
  const rows = await db
    .prepare(`
      SELECT d.id,d.category,d.title,d.grade,d.original_name AS originalName,
        ak.original_name AS answerKeyOriginalName,ak.content_type AS answerKeyContentType,
        ak.source_format AS answerKeySourceFormat,ak.normalized_json AS normalizedAnswerKey,
        ak.normalization_error AS normalizationError,ak.grading_available AS gradingAvailable,
        es.status AS solutionStatus,es.progress AS solutionProgress,es.phase AS solutionPhase,es.model AS solutionModel,
        es.error_code AS solutionErrorCode,es.error_message AS solutionErrorMessage
      FROM documents d LEFT JOIN answer_keys ak ON ak.document_id=d.id
      LEFT JOIN exam_solutions es ON es.document_id=d.id
      WHERE d.category IN ('theory','practice','exam','test')
        ${isSubordinateAdmin ? "AND d.uploaded_by=?" : ""}
      ORDER BY d.grade,d.title
    `)
    .all(...(isSubordinateAdmin ? [req.user.id] : []));
  const sections = { theory: [], practice: [], exam: [], test: [] };
  for (const row of rows) {
    sections[row.category].push({
      id: row.id,
      title: row.title,
      grade: row.grade,
      originalName: row.originalName,
      hasAnswerKey: Boolean(row.answerKeyOriginalName),
      answerKeyOriginalName: row.answerKeyOriginalName || null,
      answerKeyContentType: row.answerKeyContentType || null,
      answerKeySourceFormat: row.answerKeySourceFormat || null,
      normalizationError: row.normalizationError || null,
      gradingAvailable: Boolean(row.gradingAvailable && row.normalizedAnswerKey),
      solutionStatus: row.solutionStatus || "not_started",
      solutionProgress: Number(row.solutionProgress) || 0,
      solutionMode:
        row.solutionModel === "Nhập thủ công" || row.solutionPhase === "Nhập đáp án thủ công"
          ? "manual"
          : "ai",
      solutionPhase: row.solutionPhase || "Chưa tạo lời giải",
      solutionErrorCode: row.solutionErrorCode || null,
      solutionErrorMessage: row.solutionErrorMessage || null
    });
  }
  res.json({ sections });
});

app.get("/api/admin/documents/:id/solution", requireAdmin, async (req, res) => {
  const isSubordinateAdmin = Number(req.user.adminLevel) < 2;
  const row = await db
    .prepare(`
      SELECT d.id,d.title,d.subject,d.category,d.original_name,d.uploaded_by,ak.original_name AS referenceAnswerName,
        s.status,s.progress,s.phase,s.model,s.source_hash,s.generated_json,s.approved_json,
        s.error_code,s.error_message,s.solution_version,s.generated_at,s.approved_at
      FROM documents d LEFT JOIN exam_solutions s ON s.document_id=d.id
      LEFT JOIN answer_keys ak ON ak.document_id=d.id
      WHERE d.id=? ${isSubordinateAdmin ? "AND d.uploaded_by=?" : ""}
    `)
    .get(...(isSubordinateAdmin ? [String(req.params.id), req.user.id] : [String(req.params.id)]));
  if (!row) return res.status(404).json({ error: "Không tìm thấy đề hoặc bạn không có quyền xem tài liệu này." });
  let generated = null,
    approved = null;
  try {
    generated = JSON.parse(row.generated_json || "null");
  } catch {}
  try {
    approved = JSON.parse(row.approved_json || "null");
  } catch {}
  res.setHeader("Cache-Control", "private, no-store");
  if (req.query.download === "json") {
    const output = row.approved_json || row.generated_json;
    if (!output) return res.status(404).json({ error: "Chưa có file lời giải AI." });
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(`bo-cham-${row.id}.json`)}`
    );
    return res.send(output);
  }
  res.json({
    id: row.id,
    title: row.title,
    subject: row.subject,
    category: row.category,
    originalName: row.original_name,
    referenceAnswerName: row.referenceAnswerName || null,
    status: row.status || "not_started",
    progress: Number(row.progress) || 0,
    phase: row.phase || "Chưa tạo lời giải",
    model: row.model || null,
    sourceHash: row.source_hash || null,
    generated,
    approved,
    errorCode: row.error_code || null,
    errorMessage: row.error_message || null,
    version: Number(row.solution_version) || 0,
    generatedAt: row.generated_at || null,
    approvedAt: row.approved_at || null
  });
});

app.post("/api/admin/documents/:id/solution/generate", requireSameOrigin, requireAdmin, async (req, res) => {
  const isSubordinateAdmin = Number(req.user.adminLevel) < 2;
  const document = await db.prepare(
    "SELECT id,category FROM documents WHERE id=? " + (isSubordinateAdmin ? "AND uploaded_by=?" : "")
  ).get(...(isSubordinateAdmin ? [String(req.params.id), req.user.id] : [String(req.params.id)]));
  if (!document) return res.status(404).json({ error: "Không tìm thấy đề hoặc bạn không có quyền quản lý tài liệu này." });
  if (!["exam", "practice", "test"].includes(document.category)) {
    return res.status(400).json({ error: "Chỉ tạo lời giải cho đề ôn tập, đề thi hoặc bài kiểm tra." });
  }
  await createExamSolutionJob(document.id);
  res.status(202).json({ ok: true, id: document.id, status: "queued" });
});

app.post("/api/admin/documents/:id/solution/review", requireSameOrigin, requireAdmin, async (req, res) => {
  const documentId = String(req.params.id);
  const isSubordinateAdmin = Number(req.user.adminLevel) < 2;
  const row = await db
    .prepare(`
      SELECT d.subject,d.category,d.uploaded_by,s.generated_json,s.solution_version,s.source_hash
      FROM documents d JOIN exam_solutions s ON s.document_id=d.id
      WHERE d.id=? ${isSubordinateAdmin ? "AND d.uploaded_by=?" : ""}
    `)
    .get(...(isSubordinateAdmin ? [documentId, req.user.id] : [documentId]));
  if (!row) return res.status(404).json({ error: "Chưa có tác vụ lời giải cho đề này." });
  let generated;
  try {
    generated = JSON.parse(row.generated_json || "null");
  } catch {}
  if (!generated?.questions?.length) return res.status(409).json({ error: "AI chưa tạo lời giải để duyệt." });
  const submitted = req.body?.questions;
  if (!Array.isArray(submitted) || submitted.length !== generated.questions.length) {
    return res.status(400).json({ error: "Cần duyệt từng câu trước khi lưu bộ chấm." });
  }
  const submittedById = new Map();
  for (const item of submitted) {
    const id = String(item?.targetId || "");
    if (!id || submittedById.has(id)) return res.status(400).json({ error: "Mã câu bị thiếu hoặc trùng." });
    submittedById.set(id, item);
  }
  const config = assessmentConfigFor(row.subject, row.category);
  const isManualSource = generated.source === "manual-entry";
  if (
    !isManualSource &&
    row.category !== "test" &&
    (!config?.grading ||
      !(config.layout?.sections || [])
        .filter((section) => Number(section.count) > 0)
        .every((section) => section.grading))
  ) {
    return res.status(409).json({ error: "Thiếu criteria chấm điểm bắt buộc trong configs/exam-layouts.json." });
  }
  const answers = {};
  const points = {};
  const reviewed = [];
  for (const original of generated.questions) {
    const item = submittedById.get(original.targetId);
    if (!item || !["correct", "incorrect", "manual"].includes(item.decision)) {
      return res.status(400).json({ error: `Cần xác nhận câu ${original.targetId} là đúng hoặc sửa lại.` });
    }
    const answer = String(item.answer ?? "").trim().slice(0, 3000);
    const explanation = String(item.explanation ?? original.explanation ?? "").trim().slice(0, 12000);
    if (!answer) return res.status(400).json({ error: `Thiếu đáp án chuẩn cho câu ${original.targetId}.` });
    if (original.type === "multiple_choice") {
      const section = config?.layout?.sections?.find(
        (section) => String(section.sectionId || section.order) === original.targetId.split("-")[0]
      );
      const options = (section?.options || ["A", "B", "C", "D"]).map((value) => String(value).toUpperCase());
      if (!options.includes(answer.toUpperCase())) {
        return res
          .status(400)
          .json({ error: `Đáp án câu ${original.targetId} phải là một lựa chọn ${options.join(", ")}.` });
      }
      answers[original.targetId] = answer.toUpperCase();
    } else if (original.type === "true_false") {
      const truth = answer
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      if (["dung", "true", "d", "t"].includes(truth)) answers[original.targetId] = "true";
      else if (["sai", "false", "s", "f"].includes(truth)) answers[original.targetId] = "false";
      else return res.status(400).json({ error: `Đáp án ${original.targetId} phải là Đúng hoặc Sai.` });
    } else answers[original.targetId] = answer;
    const expectedPoints = Number(original.maximumPoints) || (original.type === "essay" ? 0.5 : 0.25);
    points[original.targetId] = expectedPoints;
    let rubric = Array.isArray(item.rubric)
      ? item.rubric
          .slice(0, 20)
          .map((criterion) => ({
            criterion: String(criterion.criterion || "").trim().slice(0, 1000),
            points: Math.max(0, Math.min(10, Number(criterion.points) || 0))
          }))
          .filter((criterion) => criterion.criterion)
      : Array.isArray(original.rubric)
        ? original.rubric
        : [];
    if (!rubric.length) {
      rubric = [
        {
          criterion: `Đáp án đúng cho câu ${original.targetId}: ${answers[original.targetId]}`,
          points: expectedPoints
        }
      ];
    } else if (original.type === "essay" && expectedPoints > 0) {
      const rubricTotal = rubric.reduce((sum, criterion) => sum + criterion.points, 0);
      if (Math.abs(rubricTotal - expectedPoints) > 0.01) {
        if (rubricTotal > 0) {
          rubric = rubric.map((r, idx, arr) => ({
            ...r,
            points:
              idx === arr.length - 1
                ? Math.max(
                    0,
                    Math.round(
                      (expectedPoints -
                        arr
                          .slice(0, -1)
                          .reduce(
                            (acc, x) => acc + Math.round((x.points / rubricTotal) * expectedPoints * 100) / 100,
                            0
                          )) *
                        100
                    ) / 100
                  )
                : Math.round((r.points / rubricTotal) * expectedPoints * 100) / 100
          }));
        } else {
          rubric[0].points = expectedPoints;
        }
      }
    }
    const uncertainty = String(original.uncertainty || "").trim();
    reviewed.push({
      ...original,
      maximumPoints: expectedPoints,
      aiAnswer: original.aiAnswer || original.answer,
      answer: answers[original.targetId],
      explanation,
      rubric,
      uncertainty: /^(none|null|undefined|n\/a)$/i.test(uncertainty) ? "" : uncertainty,
      reviewStatus:
        item.decision === "manual" ? "manual" : item.decision === "correct" ? "approved" : "corrected"
    });
  }
  const approved = {
    schemaVersion: 1,
    source: isManualSource ? "manual-entry" : "admin-reviewed-ai-solution",
    model: generated.model,
    sourceHash: row.source_hash,
    version: Number(row.solution_version) || 1,
    scale: Number(config?.grading?.scale) || 10,
    answers,
    points,
    questions: reviewed,
    reviewedAt: new Date().toISOString(),
    reviewedBy: req.user.id
  };
  let regradeStats = { gradedCount: 0, newlyGradedCount: 0 };
  const review = db.transaction(async () => {
    const insertAudit = db.prepare(`
      INSERT INTO exam_solution_reviews(document_id,solution_version,target_id,decision,before_json,after_json,reviewed_by)
      VALUES(?,?,?,?,?,?,?)
    `);
    const reviewMap = new Map(reviewed.map((item) => [item.targetId, item]));
    for (const before of generated.questions) {
      const after = reviewMap.get(before.targetId);
      await insertAudit.run(
        documentId,
        approved.version,
        before.targetId,
        after.reviewStatus === "approved" ? "correct" : "corrected",
        JSON.stringify(before),
        JSON.stringify(after),
        req.user.id
      );
    }
    await updateSolutionJob(documentId, {
      status: "ready",
      progress: 100,
      phase: "Đã duyệt, sẵn sàng chấm",
      approved_json: JSON.stringify(approved),
      approved_at: approved.reviewedAt,
      approved_by: req.user.id,
      error_code: null,
      error_message: null
    });
    if (row.category === "test") {
      await db.prepare("UPDATE tests SET has_answer_key=1 WHERE id=?").run(documentId);
    }
  });
  await review();
  if (row.category === "test" && testsModule?.regradeTestSubmissionsForTest) {
    try {
      regradeStats = await testsModule.regradeTestSubmissionsForTest(documentId, req.user);
    } catch (err) {
      console.error("Could not auto-regrade test submissions:", err.message);
    }
  }
  res.json({
    ok: true,
    status: "ready",
    version: approved.version,
    scale: approved.scale,
    questionCount: reviewed.length,
    regradedSubmissionsCount: regradeStats.gradedCount,
    newlyGradedCount: regradeStats.newlyGradedCount
  });
});

app.post(
  "/api/admin/documents/:id/answer-key",
  requireSameOrigin,
  requireAdmin,
  upload.single("answerKey"),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Select an answer-key file." });
      if (![".pdf", ".txt", ".json", ".csv", ".docx"].includes(path.extname(req.file.originalname).toLowerCase())) {
        return res.status(400).json({ error: "Invalid answer key format." });
      }
      const isSubordinateAdmin = Number(req.user.adminLevel) < 2;
      const doc = await db
        .prepare("SELECT id,category,subject FROM documents WHERE id=? " + (isSubordinateAdmin ? "AND uploaded_by=?" : ""))
        .get(...(isSubordinateAdmin ? [String(req.params.id), req.user.id] : [String(req.params.id)]));
      if (!doc) return res.status(404).json({ error: "Không tìm thấy đề hoặc bạn không có quyền quản lý tài liệu này." });
      if (!["practice", "exam", "test"].includes(doc.category)) {
        return res.status(400).json({ error: "Theory documents do not need an answer key." });
      }
      const cfg = assessmentConfigFor(doc.subject, doc.category),
        norm = await normalizeAnswerKeyDocument(req.file.buffer, req.file.originalname, cfg?.layout, cfg?.grading);
      await saveAnswerKeyRecord(doc.id, req.file, req.user.id, norm);
      return res.json({
        ok: true,
        hasAnswerKey: true,
        gradingAvailable: Boolean(norm),
        answerKeyOriginalName: req.file.originalname,
        normalizedFormat: norm ? "json" : null
      });
    } catch (e) {
      return next(e);
    }
  }
);

app.get("/api/admin/documents/:id/answer-key", requireAdmin, async (req, res, next) => {
  try {
    const isSubordinateAdmin = Number(req.user.adminLevel) < 2;
    const row = await db.prepare(`
      SELECT ak.file_data,ak.r2_key,ak.original_name,ak.content_type
      FROM answer_keys ak JOIN documents d ON d.id=ak.document_id
      WHERE ak.document_id=? ${isSubordinateAdmin ? "AND d.uploaded_by=?" : ""}
    `).get(...(isSubordinateAdmin ? [String(req.params.id), req.user.id] : [String(req.params.id)]));
    const bytes = row?.r2_key
      ? await getDocumentBuffer(row, "r2_key", "file_data")
      : row?.file_data
        ? Buffer.from(row.file_data)
        : null;
    if (!bytes) return res.status(404).json({ error: "No answer key is attached to this document." });
    res.setHeader("Content-Type", row.content_type || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(row.original_name || "answer-key")}`
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    return res.end(bytes);
  } catch (e) {
    return next(e);
  }
});

app.delete("/api/admin/documents/:id", requireSameOrigin, requireAdmin, async (req, res, next) => {
  try {
    const isSubordinateAdmin = Number(req.user.adminLevel) < 2;
    const doc = await db.prepare(
      "SELECT id,filename,r2_key FROM documents WHERE id=? " + (isSubordinateAdmin ? "AND uploaded_by=?" : "")
    ).get(...(isSubordinateAdmin ? [req.params.id, req.user.id] : [req.params.id]));
    if (!doc) return res.status(404).json({ error: "Không tìm thấy tài liệu hoặc bạn không có quyền xóa." });
    const ak = await db.prepare("SELECT r2_key FROM answer_keys WHERE document_id=?").get(doc.id);
    await db.prepare("DELETE FROM tests WHERE id=?").run(doc.id);
    try {
      await deleteLearningResultsByItemId(doc.id);
    } catch {}
    const result = await db.prepare("DELETE FROM documents WHERE id=?").run(doc.id);
    if (result.changes) {
      if (doc.r2_key) {
        await deleteFromR2(doc.r2_key).catch((e) => console.warn("[R2] cleanup failed:", e.message));
      }
      if (ak?.r2_key) {
        await deleteFromR2(ak.r2_key).catch((e) => console.warn("[R2] answer key cleanup failed:", e.message));
      }
      const local = path.join(documentsDir, path.basename(doc.filename));
      if (fs.existsSync(local)) fs.unlinkSync(local);
    }
    return res.json({ ok: true, deletedId: doc.id });
  } catch (e) {
    return next(e);
  }
});

app.get("/api/documents/:id/file", async (req, res, next) => {
  try {
    const isSubordinateAdmin = req.user?.role === "admin" && Number(req.user.adminLevel) < 2;
    const doc = await db.prepare(
      "SELECT * FROM documents WHERE id=? " + (isSubordinateAdmin ? "AND uploaded_by=?" : "")
    ).get(...(isSubordinateAdmin ? [req.params.id, req.user.id] : [req.params.id]));
    if (!doc) return res.sendStatus(404);
    const bytes = await getDocumentBuffer(doc);
    if (!bytes) return res.status(410).json({ error: "File tài liệu không còn trong R2 hoặc kho cũ." });
    if (!doc.r2_key) {
      const backfillKey = createR2Key(
        "documents",
        doc.id,
        doc.original_name || doc.filename || "file.pdf"
      );
      uploadToR2({
        key: backfillKey,
        body: bytes,
        contentType: doc.content_type || contentTypeFor(doc.original_name || "")
      })
        .then(() =>
          db
            .prepare("UPDATE documents SET r2_key=? WHERE id=? AND (r2_key IS NULL OR r2_key='')")
            .run(backfillKey, doc.id)
        )
        .catch((err) => console.warn("[R2] Lazy backfill failed:", err.message));
    }
    const ext = path.extname(doc.original_name).toLowerCase(),
      inline = new Set([".pdf", ".txt", ".png", ".jpg", ".jpeg"]);
    res.setHeader("Content-Type", doc.content_type || "application/octet-stream");
    res.setHeader("Content-Length", bytes.length);
    res.setHeader(
      "Content-Disposition",
      `${inline.has(ext) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    return res.end(bytes);
  } catch (e) {
    return next(e);
  }
});

app.get("/api/admin/submissions", requireAdmin, async (req, res) => {
  const isSubordinateAdmin = Number(req.user.adminLevel) < 2;
  const rows = await db
    .prepare(`
      SELECT s.id,s.subject,s.grade,s.category,s.title,s.original_name AS originalName,s.size,s.status,
        s.created_at AS createdAt,s.answer_key_original_name AS answerKeyOriginalName,
        u.name AS userName,u.email AS userEmail
      FROM document_submissions s JOIN users u ON u.id=s.user_id
      WHERE s.status='pending'
        ${isSubordinateAdmin ? "AND s.user_id=? AND u.role='admin' AND u.admin_level<2" : ""}
      ORDER BY s.id ASC
    `)
    .all(...(isSubordinateAdmin ? [req.user.id] : []));
  res.json({ submissions: rows });
});

app.post("/api/admin/submissions/:id/review", requireSameOrigin, requireAdmin, async (req, res, next) => {
  const id = Number(req.params.id),
    decision = String(req.body?.decision || ""),
    note = String(req.body?.note || "").slice(0, 500);
  try {
    if (!Number.isInteger(id) || !["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ error: "Invalid review decision." });
    }
    const isSubordinateAdmin = Number(req.user.adminLevel) < 2;
    const sub = await db
      .prepare(
        "SELECT s.* FROM document_submissions s JOIN users u ON u.id=s.user_id " +
        "WHERE s.id=? AND s.status='pending' " +
        (isSubordinateAdmin ? "AND s.user_id=? AND u.role='admin' AND u.admin_level<2" : "")
      )
      .get(...(isSubordinateAdmin ? [id, req.user.id] : [id]));
    if (!sub) return res.status(404).json({ error: "Không tìm thấy tài liệu chờ duyệt hoặc bạn không có quyền xử lý tài liệu này." });
    const bytes = await getDocumentBuffer(sub, "r2_key", "file_data");
    if (decision === "approved" && !bytes) {
      return res.status(410).json({ error: "The stored document file is missing." });
    }
    let answerBytes = null,
      norm = null;
    if (decision === "approved" && (sub.answer_key_r2_key || sub.answer_key_data)) {
      answerBytes = await getDocumentBuffer(sub, "answer_key_r2_key", "answer_key_data");
      if (!answerBytes) return res.status(410).json({ error: "The stored answer key file is missing." });
      const cfg = assessmentConfigFor(sub.subject, sub.category);
      norm = await normalizeAnswerKeyDocument(
        answerBytes,
        sub.answer_key_original_name || "answer-key.txt",
        cfg?.layout,
        cfg?.grading
      );
    }
    const approvedId = `submission-${id}`,
      approvedFilename = decision === "approved" ? storedFilename(sub.original_name) : null;
    let approvedR2Key = sub.r2_key || null;
    let approvedAnswerR2Key = sub.answer_key_r2_key || null;
    if (decision === "approved") {
      if (!approvedR2Key) {
        approvedR2Key = await saveFileToR2("documents", approvedId, {
          originalname: sub.original_name,
          buffer: bytes,
          mimetype: sub.content_type || contentTypeFor(sub.original_name)
        });
      }
      if (answerBytes && !approvedAnswerR2Key) {
        const akName = sub.answer_key_original_name || "answer-key.txt";
        approvedAnswerR2Key = await saveFileToR2("answer-keys", approvedId, {
          originalname: akName,
          buffer: answerBytes,
          mimetype: sub.answer_key_content_type || contentTypeFor(akName)
        });
      }
      const target = path.join(documentsDir, approvedFilename);
      if (!fs.existsSync(target)) fs.writeFileSync(target, bytes, { flag: "wx" });
    }
    try {
      const tx = db.transaction(async () => {
        await db
          .prepare(
            "UPDATE document_submissions SET status=?,admin_note=?,reviewed_by=?,reviewed_at=datetime('now') WHERE id=?"
          )
          .run(decision, note, req.user.id, id);
        if (decision === "approved") {
          await db
            .prepare(
              `INSERT INTO documents (id,subject,grade,category,title,filename,original_name,size,content_type,file_data,r2_key,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
            )
            .run(
              approvedId,
              sub.subject,
              sub.grade,
              sub.category,
              sub.title,
              approvedFilename,
              sub.original_name,
              sub.size,
              sub.content_type || contentTypeFor(sub.original_name),
              bytes,
              approvedR2Key,
              sub.user_id
            );
          if (answerBytes) {
            const name = sub.answer_key_original_name || "answer-key.txt",
              fmt = path.extname(name).slice(1).toLowerCase() || "unknown";
            await db
              .prepare(
                `INSERT INTO answer_keys (document_id,original_name,content_type,file_data,r2_key,source_format,normalized_json,question_ids,grading_available,normalization_error,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`
              )
              .run(
                approvedId,
                name,
                sub.answer_key_content_type || contentTypeFor(name),
                answerBytes,
                approvedAnswerR2Key,
                fmt,
                norm ? JSON.stringify(norm) : null,
                norm ? JSON.stringify(Object.keys(norm.answers)) : null,
                norm ? 1 : 0,
                norm ? null : "Tệp đáp án chưa được chuẩn hóa.",
                sub.user_id
              );
          }
        }
        await notifyUser(
          sub.user_id,
          decision === "approved" ? "document_approved" : "document_rejected",
          decision === "approved" ? "Tài liệu được duyệt" : "Tài liệu chưa được duyệt",
          decision === "approved"
            ? `Tài liệu ${sub.title} của bạn đã được duyệt.`
            : `Tài liệu ${sub.title} chưa được duyệt.${note ? " Lý do: " + note : ""}`
        );
      });
      await tx();
    } catch (error) {
      if (approvedFilename) {
        const target = path.join(documentsDir, approvedFilename);
        if (fs.existsSync(target)) fs.unlinkSync(target);
      }
      throw error;
    }
    if (decision === "rejected") {
      if (sub.r2_key) {
        await deleteFromR2(sub.r2_key).catch((e) =>
          console.warn("[R2] rejected file cleanup failed:", e.message)
        );
      }
      if (sub.answer_key_r2_key) {
        await deleteFromR2(sub.answer_key_r2_key).catch((e) =>
          console.warn("[R2] rejected key cleanup failed:", e.message)
        );
      }
    } else if (["exam", "practice"].includes(sub.category)) {
      await createExamSolutionJob(approvedId);
    }
    return res.json({ ok: true, status: decision });
  } catch (e) {
    return next(e);
  }
});

app.post("/api/ai/difficulty", async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "Chưa cấu hình GEMINI_API_KEY trong file server/.env." });
  const { text = "", title = "Đề thi" } = req.body || {};
  if (!String(text).trim()) {
    return res.status(400).json({ error: "Đề thi chưa có nội dung văn bản để phân tích." });
  }
  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-3.6-flash" });
    const prompt = `Bạn là trợ lý đánh giá độ khó đề thi Toán THPT. Hãy phân tích đề sau bằng tiếng Việt, không tự khẳng định đáp án nếu thiếu dữ liệu. Trả lời ngắn gọn theo cấu trúc: Mức độ tổng quát (dễ/trung bình/khó), phân tích theo kiến thức, độ phân hóa, thời gian ước lượng và lưu ý.\nTên đề: ${String(
      title
    ).slice(0, 120)}\nNội dung đề:\n${String(text).slice(0, 18000)}`;
    const result = await model.generateContent(prompt);
    res.json({ analysis: result.response.text() });
  } catch (err) {
    console.error("Gemini error:", err);
    res.status(502).json({
      error: "Gemini không thể xử lý yêu cầu lúc này. Hãy kiểm tra model, API key và quota."
    });
  }
});

app.use("/api/chemistry", chemistryRouter);
app.use("/api/ai", universalAiRouter);

testsModule = installTestsModule({
  app,
  db,
  upload,
  requireAuth,
  requireAdmin,
  requireSameOrigin,
  assessmentConfigFor,
  createExamSolutionJob,
  saveAnswerKeyRecord,
  saveFileToR2,
  deleteFromR2,
  storedFilename,
  contentTypeFor,
  documentsDir,
  getDocumentBuffer,
  notifyUser,
  notifyAdmins
});
installStudyRooms({ app, db, requireAuth, requireSameOrigin });

app.use((err, _req, res, _next) => {
  console.error(err.message);
  const status = err.name === "MulterError" ? 400 : 400;
  res.status(status).json({ error: err.message || "Yêu cầu không hợp lệ." });
});

export async function initializeApplicationRuntime() {
  await initAuthDatabase();
  await initChatDatabase();
  if (testsModule?.initTestsModuleDatabase) {
    await testsModule.initTestsModuleDatabase();
  }
  await createInitialAdmin();
  await importLegacyDocuments();
  await normalizeLegacyDocumentCategories();
  await migrateLegacyAnswerKeys();
  await normalizeStoredPdfAnswerKeys();
  await migrateFilesToR2();
  const pendingJobs = await db
    .prepare("SELECT document_id FROM exam_solutions WHERE status IN ('queued','reading','solving')")
    .all();
  for (const job of pendingJobs) {
    await updateSolutionJob(job.document_id, {
      status: "queued",
      progress: 2,
      phase: "Tiếp tục tác vụ sau khi máy chủ khởi động lại"
    });
    queueExamSolution(job.document_id);
  }
}

if (process.env.MAIHOC_SKIP_AUTO_LISTEN !== "1") {
  await initializeApplicationRuntime();
  server.listen(port, () => console.log(`MAI HOC is running at http://localhost:${port}`));
}
