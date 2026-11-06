import { lockQuestionBank, findDuplicateQuestion } from '../platform/question-bank-policy.js';
import multer from "multer";
import { randomUUID } from "node:crypto";
import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  hasActiveExam,
  fail,
  text,
  integer,
  audit,
} from "../platform/policy.js";
import { upgradeAccess, chargeAi, uuid } from "./policy.js";
import { generateSchool } from "./ai.js";
export const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
export const storage = {
  async put(key, bytes, mimeType) {
    const r = await import("../r2-storage.js");
    return r.uploadToR2({ key, body: bytes, contentType: mimeType });
  },
  async get(key) {
    const r = await import("../r2-storage.js");
    return Buffer.from(
      await (await r.readFromR2(key)).Body.transformToByteArray(),
    );
  },
  async delete(key) {
    return (await import("../r2-storage.js")).deleteFromR2(key);
  },
};
export async function assertNoExam(db, userId) {
  if (await hasActiveExam(db, userId))
    fail("AI và tài liệu hỗ trợ tạm dừng trong phiên kiểm tra.", 403);
}
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
export function validateDocument(kind, value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Kết quả AI không đúng cấu trúc.", 502);
  if (kind === "notebook") {
    if (!str(value.transcript, 24000).trim())
      fail("Chưa đọc được nội dung vở.", 422);
    return {
      transcript: str(value.transcript, 24000),
      warnings: (Array.isArray(value.warnings) ? value.warnings : [])
        .slice(0, 100)
        .map((x) => str(x, 500)),
    };
  }
  if (kind === "notebook_feedback") {
    if (!Array.isArray(value.feedback) || value.feedback.length > 100)
      fail("Phản hồi vở không hợp lệ.", 502);
    return {
      summary: str(value.summary, 4000),
      feedback: value.feedback.map((x) =>
        Object.fromEntries(
          ["original", "error", "explanation", "suggestion"].map((k) => [
            k,
            str(x?.[k], 4000),
          ]),
        ),
      ),
    };
  }
  if (
    !Array.isArray(value.items) ||
    !value.items.length ||
    value.items.length > 100
  )
    fail("Tài liệu cần có từ 1 đến 100 câu.", 422);
  return {
    items: value.items.map((x, i) => {
      if (
        !x ||
        !str(x.label, 80).trim() ||
        (kind === "exam" && !str(x.stem, 8000).trim())
      )
        fail(`Câu ${i + 1} thiếu số câu/nội dung.`, 422);
      const item = {
        label: str(x.label, 80).trim(),
        section: str(x.section, 100).trim(),
        answer: str(x.answer, 8000),
        page: Number.isInteger(x.page) && x.page > 0 ? x.page : 1,
        warning: str(x.warning, 1000),
      };
      if (kind === "exam")
        Object.assign(item, {
          stem: str(x.stem, 8000),
          choices: (Array.isArray(x.choices) ? x.choices : [])
            .slice(0, 10)
            .map((x) => str(x, 2000)),
        });
      return item;
    }),
  };
}
const itemKey = (x) =>
  `${x.section.trim().toLocaleLowerCase("vi")}|${x.label.trim().toLocaleLowerCase("vi")}`;
export function matchAnswers(exam, answers) {
  const warnings = [],
    counts = new Map(),
    mapped = new Map();
  for (const a of answers.items) {
    const k = itemKey(a);
    if (mapped.has(k)) warnings.push(`Đáp án trùng: ${a.section} ${a.label}`);
    mapped.set(k, a);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const seen = new Set();
  const items = exam.items.map((q) => {
    const k = itemKey(q),
      a = mapped.get(k);
    if (seen.has(k)) warnings.push(`Đề trùng số câu: ${q.label}`);
    seen.add(k);
    if (!a || counts.get(k) !== 1) {
      warnings.push(`Chưa ghép được đáp án câu ${q.section} ${q.label}`);
      return { ...q, answer: "" };
    }
    if (!a.answer.trim()) warnings.push(`Đáp án rỗng: ${q.label}`);
    return {
      ...q,
      answer: a.answer,
      warning: [q.warning, a.warning].filter(Boolean).join("; "),
      answerSource: "uploaded",
    };
  });
  for (const [k, a] of mapped)
    if (!seen.has(k))
      warnings.push(`Đáp án không có câu tương ứng: ${a.section} ${a.label}`);
  return { items, matchWarnings: warnings };
}
async function checkFile(file) {
  const b = file.buffer;
  const mime =
    b.subarray(0, 5).toString() === "%PDF-"
      ? "application/pdf"
      : b[0] === 0x89 && b.subarray(1, 4).toString() === "PNG"
        ? "image/png"
        : b[0] === 0xff && b[1] === 0xd8
          ? "image/jpeg"
          : b.subarray(0, 4).toString() === "RIFF" &&
              b.subarray(8, 12).toString() === "WEBP"
            ? "image/webp"
            : null;
  if (!mime) fail("Chỉ nhận PDF, PNG, JPEG hoặc WebP hợp lệ.", 415);
  if (mime === "application/pdf") {
    const pdf = await getDocument({
      data: new Uint8Array(b),
      isEvalSupported: false,
    }).promise;
    try {
      if (pdf.numPages > 20)
        fail("Bản thử nghiệm nhận tối đa 20 trang PDF.", 413);
    } finally {
      await pdf.destroy();
    }
  }
  return mime;
}
export function installDocuments(router, { db, store = storage }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
      fields: 8,
      fieldSize: 30000,
    },
  }).single("file");
  const own = async (req, id = req.params.id) => {
    const j = (
      await db.query(
        "SELECT * FROM school_document_jobs WHERE id=$1 AND user_id=$2",
        [uuid(id), req.user.id],
      )
    ).rows[0];
    if (!j) fail("Không tìm thấy tài liệu của bạn.", 404);
    await upgradeAccess(db, req.user, j.school_id);
    await assertNoExam(db, req.user.id);
    return j;
  };
  router.get(
    "/documents",
    wrap(async (req, res) => {
      const sid = integer(req.query.schoolId, "Trường");
      await upgradeAccess(db, req.user, sid);
      await assertNoExam(db, req.user.id);
      res.json({
        jobs: (
          await db.query(
            "SELECT id,title,kind,status,created_at,error FROM school_document_jobs WHERE user_id=$1 AND school_id=$2 ORDER BY created_at DESC LIMIT 50",
            [req.user.id, sid],
          )
        ).rows,
      });
    }),
  );
  router.post(
    "/documents",
    upload,
    wrap(async (req, res) => {
      const sid = integer(req.body.schoolId, "Trường");
      await upgradeAccess(db, req.user, sid);
      await assertNoExam(db, req.user.id);
      const kind = req.body.kind;
      if (!["exam", "answers", "notebook"].includes(kind))
        fail("Loại tài liệu không hợp lệ.");
      const requestKey = uuid(req.body.requestKey),
        title = text(req.body.title, "Tên tài liệu", 200),
        subject = text(req.body.subject, "Môn học", 100);
      const prior = (
        await db.query(
          "SELECT id FROM school_document_jobs WHERE user_id=$1 AND request_key=$2",
          [req.user.id, requestKey],
        )
      ).rows[0];
      if (prior) return res.json(prior);
      let sourceKey = null,
        sourceType = null,
        result = null;
      if (req.file) {
        sourceType = await checkFile(req.file);
        await chargeAi(db, req.user, sid);
        sourceKey = `school-private/${sid}/${req.user.id}/${randomUUID()}`;
        await store.put(sourceKey, req.file.buffer, sourceType);
      } else {
        try {
          result = validateDocument(kind, JSON.parse(req.body.content));
        } catch (error) {
          if (error.status) throw error;
          fail("Nhập bản chép JSON hợp lệ hoặc tải tệp.");
        }
      }
      const id = randomUUID();
      try {
        await db.query(
          `INSERT INTO school_document_jobs(id,school_id,user_id,kind,title,subject,source_key,source_type,result,status,request_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            id,
            sid,
            req.user.id,
            kind,
            title,
            subject,
            sourceKey,
            sourceType,
            result ? JSON.stringify(result) : null,
            result ? "needs_review" : "queued",
            requestKey,
          ],
        );
      } catch (error) {
        if (sourceKey) await store.delete(sourceKey).catch(() => {});
        if (error.code === "23505") {
          const duplicate = (
            await db.query(
              "SELECT id FROM school_document_jobs WHERE user_id=$1 AND request_key=$2",
              [req.user.id, requestKey],
            )
          ).rows[0];
          if (duplicate) return res.json(duplicate);
        }
        throw error;
      }
      res.status(201).json({ id });
    }),
  );
  router.get(
    "/documents/:id",
    wrap(async (req, res) => {
      const j = await own(req);
      res.json(j);
    }),
  );
  router.get(
    "/documents/:id/source",
    wrap(async (req, res) => {
      const j = await own(req);
      if (!j.source_key) fail("Tài liệu nhập thủ công không có tệp gốc.", 404);
      res
        .type(j.source_type)
        .set("Content-Disposition", "inline")
        .send(await store.get(j.source_key));
    }),
  );
  router.patch(
    "/documents/:id",
    wrap(async (req, res) => {
      const j = await own(req);
      if (j.published_ids.length)
        fail("Đề đã đưa vào ngân hàng. Tạo tài liệu mới để giữ lịch sử.", 409);
      if (!["needs_review", "ready"].includes(j.status))
        fail("Tài liệu chưa sẵn sàng để sửa.", 409);
      const result = validateDocument(j.kind, req.body.result);
      const review = req.body.confirmed === true;
      if (review && ["exam", "answers"].includes(j.kind)) {
        const keys = result.items.map(itemKey);
        if (new Set(keys).size !== keys.length)
          fail("Còn trùng số câu trong cùng phần.", 422);
      }
      const r = await db.query(
        `UPDATE school_document_jobs SET result=$3,status=$4,revision=revision+1 WHERE id=$1 AND user_id=$2 AND revision=$5 RETURNING *`,
        [
          j.id,
          req.user.id,
          JSON.stringify(result),
          review ? "ready" : "needs_review",
          integer(req.body.revision, "Phiên bản", 0),
        ],
      );
      if (!r.rows.length)
        fail("Tài liệu đã thay đổi. Tải lại trước khi lưu.", 409);
      res.json(r.rows[0]);
    }),
  );
  router.post(
    "/documents/:id/match",
    wrap(async (req, res) => {
      const j = await own(req),
        a = await own(req, req.body.answerId);
      if (j.published_ids.length)
        fail("Đề đã đưa vào ngân hàng, không thể ghép lại.", 409);
      if (
        j.kind !== "exam" ||
        a.kind !== "answers" ||
        j.school_id !== a.school_id ||
        !j.result ||
        !a.result
      )
        fail("Chọn đề và bản đáp án cùng trường đã đọc xong.");
      const result = matchAnswers(j.result, a.result);
      const r = await db.query(
        `UPDATE school_document_jobs SET result=$3,status='needs_review',revision=revision+1 WHERE id=$1 AND user_id=$2 AND revision=$4 RETURNING *`,
        [j.id, req.user.id, JSON.stringify(result), j.revision],
      );
      if (!r.rows.length) fail("Đề đã thay đổi, tải lại để ghép.", 409);
      res.json(r.rows[0]);
    }),
  );
  router.post(
    "/documents/:id/feedback",
    wrap(async (req, res) => {
      const j = await own(req);
      if (j.kind !== "notebook" || j.status !== "ready")
        fail("Hãy xác nhận bản chép vở trước khi phân tích.", 409);
      if (!["hint", "check", "solve"].includes(req.body.mode))
        fail("Chế độ không hợp lệ.");
      const requestKey = uuid(req.body.requestKey);
      const duplicate = (
        await db.query(
          "SELECT id FROM school_document_jobs WHERE user_id=$1 AND request_key=$2",
          [req.user.id, requestKey],
        )
      ).rows[0];
      if (duplicate) return res.json(duplicate);
      await chargeAi(db, req.user, j.school_id);
      const id = randomUUID();
      await db.query(
        `INSERT INTO school_document_jobs(id,school_id,user_id,kind,title,subject,parent_id,payload,request_key) VALUES($1,$2,$3,'notebook_feedback',$4,$5,$6,$7,$8)`,
        [
          id,
          j.school_id,
          req.user.id,
          j.title,
          j.subject,
          j.id,
          JSON.stringify({
            transcript: j.result.transcript,
            mode: req.body.mode,
          }),
          requestKey,
        ],
      );
      res.status(201).json({ id });
    }),
  );
  router.post(
    "/documents/:id/publish",
    wrap(async (req, res) => {
      const j = await own(req);
      await upgradeAccess(db, req.user, j.school_id, [
        "teacher",
        "school_admin",
      ]);
      const topicId = integer(req.body.topicId, "Chuyên đề");
      const out = await db.transaction(async () => {
        const current = (
          await db.query(
            "SELECT * FROM school_document_jobs WHERE id=$1 FOR UPDATE",
            [j.id],
          )
        ).rows[0];
        if (current.published_ids.length) return current.published_ids;
        if (
          current.kind !== "exam" ||
          current.status !== "ready" ||
          current.result.items.some((x) => !x.answer.trim())
        )
          fail("Cần đề đã đối chiếu và đủ đáp án.", 409);
        const node = (
          await db.query(
            "SELECT * FROM curriculum_nodes WHERE id=$1 AND school_id=$2 AND subject=$3",
            [topicId, j.school_id, j.subject],
          )
        ).rows[0];
        if (!node) fail("Chuyên đề không khớp trường/môn.");
        await lockQuestionBank(db, j.school_id);
        const ids = [];
        for (const q of current.result.items) {
          let answer = q.answer.trim(),
            type = q.choices.length ? "multiple_choice" : "essay";
          if (type === "multiple_choice") {
            const label = answer.match(/^[A-J]$/i);
            const n = label
              ? label[0].toUpperCase().charCodeAt(0) - 65
              : /^\d+$/.test(answer)
                ? Number(answer)
                : -1;
            if (n < 0 || n >= q.choices.length)
              fail(
                `Câu ${q.label}: nhập đáp án bằng A/B/C… hoặc vị trí bắt đầu từ 0.`,
                422,
              );
            answer = String(n);
          }
          const duplicate = await findDuplicateQuestion(db, j.school_id, { subject: j.subject, grade: node.grade, type, stem: q.stem, choices: q.choices });
          if (duplicate) {
            if (!ids.some(id => String(id) === String(duplicate.id))) ids.push(duplicate.id);
            continue;
          }
          const item = (
            await db.query(
              "INSERT INTO question_items(school_id,created_by) VALUES($1,$2) RETURNING id",
              [j.school_id, req.user.id],
            )
          ).rows[0];
          const v = (
            await db.query(
              `INSERT INTO question_versions(school_id,question_item_id,version,subject,grade,curriculum_node_id,type,stem,choices,answer,source) VALUES($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
              [
                j.school_id,
                item.id,
                j.subject,
                node.grade,
                node.id,
                type,
                q.stem,
                JSON.stringify(q.choices),
                answer,
                `Số hóa AI · ${j.id} · ${q.section} ${q.label}`,
              ],
            )
          ).rows[0];
          ids.push(v.id);
        }
        await db.query(
          "UPDATE school_document_jobs SET published_ids=$2 WHERE id=$1",
          [j.id, JSON.stringify(ids)],
        );
        await audit(
          db,
          req.user,
          j.school_id,
          "draft_questions",
          "document",
          j.id,
          { questionIds: ids },
        );
        return ids;
      })();
      res.json({ questionIds: out, status: "draft" });
    }),
  );
  router.delete(
    "/documents/:id",
    wrap(async (req, res) => {
      const j = await own(req);
      if (j.status === "running")
        fail("Chờ tác vụ kết thúc trước khi xóa.", 409);
      await db.query(
        "DELETE FROM school_document_jobs WHERE id=$1 AND user_id=$2",
        [j.id, req.user.id],
      );
      res.json({ deleted: true });
    }),
  );
  router.get(
    "/documents/:id/pdf",
    wrap(async (req, res) => {
      const j = await own(req);
      if (!j.result || !["ready", "needs_review"].includes(j.status))
        fail("Tài liệu chưa đọc xong.", 409);
      const mode = req.query.mode || "questions";
      if (!["questions", "answers", "complete"].includes(mode))
        fail("Chế độ xuất không hợp lệ.");
      if (
        j.kind === "exam" &&
        mode !== "questions" &&
        (j.status !== "ready" || j.result.items.some((x) => !x.answer?.trim()))
      )
        fail(
          "Xác nhận bản đối chiếu và điền đủ đáp án trước khi xuất bộ hoàn chỉnh.",
          409,
        );
      res
        .type("application/pdf")
        .set(
          "Content-Disposition",
          `attachment; filename="maihoc-${j.kind}-${mode}.pdf"`,
        );
      const pdf = new PDFDocument({ size: "A4", margin: 44 });
      pdf.on("error", () => res.destroy());
      pdf.pipe(res);
      pdf
        .font(
          fileURLToPath(new URL("../assets/DejaVuSans.ttf", import.meta.url)),
        )
        .fontSize(17)
        .text(j.title)
        .moveDown();
      pdf
        .fontSize(9)
        .text(
          `${j.subject} | ${j.status === "ready" ? "Đã đối chiếu" : "BẢN NHÁP - cần đối chiếu"} | MAIHOC School`,
        )
        .moveDown();
      if (j.kind === "notebook") pdf.fontSize(11).text(j.result.transcript);
      else if (j.kind === "notebook_feedback") {
        pdf
          .fontSize(11)
          .text("Phản hồi AI - chưa phải điểm chính thức")
          .moveDown()
          .text(j.result.summary);
        for (const f of j.result.feedback) {
          pdf
            .moveDown()
            .text(
              `Bài gốc: ${f.original}\nNhận xét: ${f.error}\nGiải thích: ${f.explanation}\nGợi ý: ${f.suggestion}`,
            );
        }
      } else
        for (const q of j.result.items) {
          pdf.moveDown().fontSize(11).text(`${q.section} - Câu ${q.label}`);
          if (j.kind === "exam" && mode !== "answers") {
            pdf.text(q.stem);
            q.choices.forEach((x, i) =>
              pdf.text(`${String.fromCharCode(65 + i)}. ${x}`),
            );
          }
          if (j.kind === "answers" || mode !== "questions")
            pdf.text(`Đáp án nguồn: ${q.answer || "[chưa có]"}`);
          if (q.warning) pdf.fontSize(9).text(`Lưu ý nhận diện: ${q.warning}`);
        }
      pdf.end();
    }),
  );
}
export async function workDocumentOnce({
  db,
  store = storage,
  generate = generateSchool,
}) {
  const token = randomUUID();
  const job = await db.transaction(
    async () =>
      (
        await db.query(
          `WITH candidate AS (SELECT id FROM school_document_jobs WHERE status='queued' OR (status='running' AND lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE school_document_jobs j SET status='running',attempts=attempts+1,lease_token=$1,lease_until=now()+interval '3 minutes' FROM candidate c WHERE j.id=c.id RETURNING j.*`,
          [token],
        )
      ).rows[0],
  )();
  if (!job) return false;
  try {
    if (job.attempts > 3) fail("Tác vụ đã hết số lần thử.", 422);
    const u = (await db.query("SELECT * FROM users WHERE id=$1", [job.user_id]))
      .rows[0];
    await upgradeAccess(db, u, job.school_id);
    await assertNoExam(db, job.user_id);
    const result = validateDocument(
      job.kind,
      await generate({
        kind: job.kind,
        subject: job.subject,
        payload: job.payload,
        file: job.source_key
          ? {
              mimeType: job.source_type,
              bytes: await store.get(job.source_key),
            }
          : null,
      }),
    );
    // Re-check before committing in case a test began while the provider was generating.
    await assertNoExam(db, job.user_id);
    await db.query(
      `UPDATE school_document_jobs SET result=$3,status='needs_review',lease_until=NULL,error=NULL,revision=revision+1 WHERE id=$1 AND lease_token=$2 AND status='running'`,
      [job.id, token, JSON.stringify(result)],
    );
  } catch (error) {
    await db.query(
      `UPDATE school_document_jobs SET status='failed',error=$3,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND status='running'`,
      [
        job.id,
        token,
        error.safeAiError
          ? error.message
          : error.status
            ? error.message
            : "Không xử lý được tài liệu. Vui lòng kiểm tra tệp và thử lại.",
      ],
    );
  }
  return true;
}
