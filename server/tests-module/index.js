import fs from "node:fs";
import path from "node:path";
import { normalizeAnswerKeyDocument, gradeAnswers, extractDocxText, answersMatch } from "../grading/engine.js";
import {
  initResultsDatabase,
  upsertLearningResult,
  deleteLearningResultsByItemId,
  syncFromMainDatabase,
  buildTeacherScoresSheetExport,
  buildUserLearningResultsSheetExport,
  listRegisteredSubjects,
  ensureSubjectRegistered
} from "./results-db.js";

const ALLOWED_DURATIONS = new Set([0, 30, 45, 60, 90, 120]);

function answerTargetsForLayout(layout) {
  const targets = [];
  for (const section of layout?.sections || []) {
    const sectionId = String(section.sectionId || section.order || "");
    const count = Math.max(0, Math.floor(Number(section.count) || 0));
    for (let number = 1; number <= count; number++) {
      const questionId = `${sectionId}-${number}`;
      if (section.type === "true_false") {
        for (const statement of (section.statements || ["a", "b", "c", "d"]).map(String)) {
          targets.push({
            targetId: `${questionId}${statement}`,
            questionId,
            sectionId,
            number,
            statement,
            type: section.type,
            maximumPoints:
              Number(
                section.grading?.pointsByCorrectStatements?.[
                  String((section.statements || ["a", "b", "c", "d"]).length)
                ]
              ) || 1
          });
        }
      } else {
        targets.push({
          targetId: questionId,
          questionId,
          sectionId,
          number,
          type: section.type,
          maximumPoints:
            Number(section.grading?.pointsPerCorrect) || (section.type === "essay" ? 0.5 : 0.25)
        });
      }
    }
  }
  return targets;
}

async function extractRawTextFromBuffer(buffer, filename = "") {
  if (!buffer || !buffer.length) return "";
  const ext = path.extname(String(filename || "")).toLowerCase();
  try {
    if (ext === ".txt") {
      return Buffer.from(buffer).toString("utf8");
    }
    if (ext === ".docx") {
      return extractDocxText(Buffer.from(buffer));
    }
    if (ext === ".pdf") {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
        isEvalSupported: false,
        verbosity: 0
      });
      const pdf = await loadingTask.promise;
      const pages = [];
      try {
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const text = content.items.map((item) => `${item.str || ""}${item.hasEOL ? "\n" : " "}`).join("");
          pages.push(text);
          page.cleanup?.();
        }
      } finally {
        await loadingTask.destroy();
      }
      return pages.join("\n\n").trim();
    }
  } catch (error) {
    console.warn("Could not extract text from test file:", error.message);
  }
  return "";
}

export function parseQuestionsFromRawText(rawText) {
  const text = String(rawText || "").replace(/\u00a0/g, " ").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const flat = text.replace(/[\t\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  const headings = [...flat.matchAll(/\b(?:câu|cau|bài|bai|question|q)\s*(\d+)\s*[.:)]/giu)];
  if (!headings.length) return [];

  const sectionMatches = [...flat.matchAll(/\b(?:phần|phan)\s+(i{1,3}|iv|v|\d+)\b/giu)];
  const romanMap = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
  const sections = sectionMatches.map((m, idx) => {
    const token = m[1].toUpperCase();
    const order = /^\d+$/.test(token) ? Number(token) : romanMap[token] || idx + 1;
    const nextIdx = sectionMatches[idx + 1]?.index ?? flat.length;
    const snippet = flat.slice(m.index, Math.min(nextIdx, m.index + 800)).toLowerCase();
    let type = null;
    if (/đúng\s*\/?\s*sai|dung\s*\/?\s*sai/.test(snippet)) type = "true_false";
    else if (/trả lời ngắn|tra loi ngan|tự luận|tu luan/.test(snippet)) type = "essay";
    else if (/trắc nghiệm|trac nghiem/.test(snippet)) type = "multiple_choice";
    return { id: token, order, index: m.index, type };
  });

  const sectionForPos = (pos) => {
    for (let i = sections.length - 1; i >= 0; i--) {
      if (sections[i].index < pos) return sections[i];
    }
    return null;
  };

  const results = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const qNum = String(Number(h[1]));
    const sec = sectionForPos(h.index);
    const start = h.index + h[0].length;
    const end = headings[i + 1]?.index ?? flat.length;
    const body = flat.slice(start, end).trim();

    const hasMcOptions = /(?:^|\s)A\s*[).]\s*.+(?:\s)B\s*[).]/su.test(body);
    const hasTfStatements = /(?:^|\s)a\s*[).]\s*.+(?:\s)b\s*[).]/su.test(body);

    let type =
      sec?.type || (hasTfStatements ? "true_false" : hasMcOptions ? "multiple_choice" : "multiple_choice");
    const sectionId = sec?.id || (type === "true_false" ? "II" : type === "essay" ? "III" : "I");

    const statements = {};
    if (type === "true_false") {
      const stmtMatches = [...body.matchAll(/(?:^|\s)([a-d])\s*[).]\s*/gu)];
      for (let sIdx = 0; sIdx < stmtMatches.length; sIdx++) {
        const sm = stmtMatches[sIdx];
        const letter = sm[1].toLowerCase();
        const sStart = sm.index + sm[0].length;
        const sEnd = stmtMatches[sIdx + 1]?.index ?? body.length;
        statements[letter] = body.slice(sStart, sEnd).trim();
      }
    }

    results.push({
      number: qNum,
      sectionId,
      questionId: `${sectionId}-${qNum}`,
      type,
      text: body,
      statements
    });
  }
  return results;
}

export function buildQuestionTargetsForTest({
  parsedQuestions = [],
  layout = null,
  customQuestionCount = null
}) {
  const hasMultipleSections = new Set(parsedQuestions.map((q) => q.sectionId).filter(Boolean)).size > 1;
  if (parsedQuestions.length > 0 && parsedQuestions.length <= 15 && !hasMultipleSections && !customQuestionCount) {
    const targets = [];
    const totalQ = parsedQuestions.length;
    const defaultPoints = Math.round((10 / Math.max(1, totalQ)) * 100) / 100;
    parsedQuestions.forEach((q, idx) => {
      const qNum = q.number || String(idx + 1);
      const secId = q.sectionId || "I";
      const qId = `${secId}-${qNum}`;
      if (q.type === "true_false") {
        for (const stmt of ["a", "b", "c", "d"]) {
          const stmtText = q.statements?.[stmt] ? ` — Ý ${stmt}) ${q.statements[stmt]}` : ` — Mệnh đề ${stmt})`;
          targets.push({
            targetId: `${qId}${stmt}`,
            questionId: qId,
            sectionId: secId,
            number: Number(qNum) || idx + 1,
            statement: stmt,
            type: "true_false",
            maximumPoints: 1,
            questionText: `Câu ${qNum}: ${q.text}${stmtText}`
          });
        }
      } else {
        targets.push({
          targetId: qId,
          questionId: qId,
          sectionId: secId,
          number: Number(qNum) || idx + 1,
          type: q.type || "multiple_choice",
          maximumPoints: defaultPoints,
          questionText: `Câu ${qNum}: ${q.text}`
        });
      }
    });
    return targets;
  }

  const baseTargets = answerTargetsForLayout(layout);
  if (!baseTargets.length) {
    const fallbackCount = parsedQuestions.length > 0 ? parsedQuestions.length : 10;
    const defaultPts = Math.round((10 / Math.max(1, fallbackCount)) * 100) / 100;
    return Array.from({ length: fallbackCount }, (_, idx) => {
      const pq = parsedQuestions[idx];
      const qNum = pq?.number || String(idx + 1);
      const secId = pq?.sectionId || "I";
      const qId = `${secId}-${qNum}`;
      return {
        targetId: qId,
        questionId: qId,
        sectionId: secId,
        number: Number(qNum) || idx + 1,
        type: pq?.type || "multiple_choice",
        maximumPoints: defaultPts,
        questionText: pq?.text
          ? `Câu ${qNum}: ${pq.text}`
          : `Câu ${qId} (Xem nội dung chi tiết trong đề gốc)`
      };
    });
  }

  const byQuestionId = new Map();
  parsedQuestions.forEach((q, idx) => {
    byQuestionId.set(q.questionId, q);
    byQuestionId.set(`seq-${idx + 1}`, q);
  });

  let seqQuestionCounter = 0;
  let lastQuestionId = null;

  return baseTargets.map((target) => {
    if (target.questionId !== lastQuestionId) {
      seqQuestionCounter++;
      lastQuestionId = target.questionId;
    }
    const matched = byQuestionId.get(target.questionId) || byQuestionId.get(`seq-${seqQuestionCounter}`);
    let questionText = `Câu ${target.questionId}${
      target.statement ? ` — Mệnh đề ${target.statement})` : ""
    } (Đối chiếu nội dung trong đề gốc)`;
    if (matched?.text) {
      const stmtSuffix =
        target.statement && matched.statements?.[target.statement]
          ? `\nÝ ${target.statement}): ${matched.statements[target.statement]}`
          : target.statement
            ? ` (Xét mệnh đề ${target.statement})`
            : "";
      questionText = `Câu ${target.questionId}: ${matched.text}${stmtSuffix}`;
    }
    return {
      ...target,
      questionText
    };
  });
}

export function installTestsModule({
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
}) {
  const isSubordinateAdmin = (req) => req?.user?.role === "teacher";

  async function ensureTables() {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS tests (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT 'Toán',
        grade TEXT NOT NULL DEFAULT '10',
        open_at TEXT NOT NULL,
        close_at TEXT NOT NULL,
        duration_minutes BIGINT,
        answer_mode TEXT NOT NULL DEFAULT 'immediate' CHECK(answer_mode IN ('immediate', 'deferred')),
        has_answer_key BIGINT NOT NULL DEFAULT 0 CHECK(has_answer_key IN (0, 1)),
        raw_text_cache TEXT,
        questions_json TEXT,
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      ALTER TABLE tests ADD COLUMN IF NOT EXISTS class_code TEXT;
      CREATE INDEX IF NOT EXISTS tests_open_close_idx ON tests(open_at, close_at);
      CREATE INDEX IF NOT EXISTS tests_class_code_idx ON tests(class_code, open_at);

      CREATE TABLE IF NOT EXISTS test_submissions (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT 'Toán',
        grade TEXT NOT NULL DEFAULT '10',
        grading_status TEXT NOT NULL DEFAULT 'pending_grade' CHECK(grading_status IN ('pending_grade', 'graded')),
        graded BIGINT NOT NULL DEFAULT 0 CHECK(graded IN (0, 1)),
        score DOUBLE PRECISION,
        scale DOUBLE PRECISION NOT NULL DEFAULT 10,
        percent BIGINT,
        correct_count BIGINT,
        question_count BIGINT,
        duration_minutes BIGINT,
        time_spent_seconds BIGINT,
        auto_submitted_fullscreen BIGINT NOT NULL DEFAULT 0 CHECK(auto_submitted_fullscreen IN (0, 1)),
        answers_json TEXT NOT NULL,
        answer_key_json TEXT,
        result_json TEXT NOT NULL,
        teacher_note TEXT,
        started_at TEXT,
        submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
        graded_at TEXT,
        graded_by BIGINT REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS test_submissions_test_user_idx ON test_submissions(test_id, user_id, id DESC);
      CREATE INDEX IF NOT EXISTS test_submissions_status_idx ON test_submissions(grading_status, submitted_at DESC);
    `);
    // Backfill legacy tests from their document uploader when the explicit creator was not recorded.
    // Built-in samples have no uploader and remain unassigned; students still see all tests.
    await db.prepare(`
      UPDATE tests
      SET created_by = (
        SELECT d.uploaded_by FROM documents d WHERE d.id = tests.document_id
      )
      WHERE created_by IS NULL
        AND EXISTS (
          SELECT 1 FROM documents d
          WHERE d.id = tests.document_id AND d.uploaded_by IS NOT NULL
        )
    `).run();
  }

  async function seedInitialSampleTests() {
    const migrationName = "seed-sample-tests-v1";
    if (await db.prepare("SELECT 1 FROM app_migrations WHERE name = ?").get(migrationName)) return;

    const sampleTests = [
      {
        id: "test-sample-toan10-dinh-ky-01",
        title: "Bài kiểm tra định kỳ Toán 10 — Hàm số & Vectơ (Số 01)",
        subject: "Toán",
        grade: "10",
        openAt: "2026-10-01T08:00",
        closeAt: "2027-12-31T23:59",
        durationMinutes: 45,
        answerMode: "immediate",
        hasAnswerKey: 1,
        content: [
          "BÀI KIỂM TRA ĐỊNH KỲ TOÁN 10 — HÀM SỐ & VECTƠ",
          "Thời gian làm bài: 45 phút",
          "",
          "Phần I. Trắc nghiệm",
          "Câu 1. Tập xác định của hàm số y = √(x - 3) là: A. [3; +∞) B. (3; +∞) C. (-∞; 3] D. R",
          "Câu 2. Đỉnh của parabol y = x² - 4x + 3 có tọa độ là: A. I(2; 1) B. I(2; -1) C. I(-2; 15) D. I(4; 3)",
          "Câu 3. Cho hai vectơ a = (2; -1) và b = (1; 4). Tọa độ của vectơ a + b là: A. (3; 3) B. (1; -5) C. (2; -4) D. (3; -3)",
          "Câu 4. Nghiệm của phương trình x² - 5x + 6 = 0 là: A. x=1; x=6 B. x=-2; x=-3 C. x=2; x=3 D. Vô nghiệm"
        ].join("\n"),
        approvedAnswers: {
          "I-1": "A",
          "I-2": "B",
          "I-3": "A",
          "I-4": "C"
        },
        approvedPoints: {
          "I-1": 2.5,
          "I-2": 2.5,
          "I-3": 2.5,
          "I-4": 2.5
        }
      },
      {
        id: "test-sample-toan10-cho-cham-02",
        title: "Bài kiểm tra 30 phút Toán 10 — Mệnh đề & Tập hợp (Chờ giảng viên chấm)",
        subject: "Toán",
        grade: "10",
        openAt: "2026-10-15T08:00",
        closeAt: "2027-12-31T23:59",
        durationMinutes: 30,
        answerMode: "deferred",
        hasAnswerKey: 0,
        content: [
          "BÀI KIỂM TRA 30 PHÚT TOÁN 10 — MỆNH ĐỀ & TẬP HỢP",
          "Thời gian làm bài: 30 phút",
          "",
          "Phần I. Trắc nghiệm",
          "Câu 1. Trong các câu sau, câu nào là một mệnh đề toán học? A. Hôm nay trời đẹp quá! B. Số 15 là số lẻ. C. Bạn học lớp mấy? D. Hãy làm bài tập đi!",
          "Câu 2. Cho tập hợp A = {1; 2; 3; 4} và B = {3; 4; 5}. Tập hợp A ∩ B là: A. {1; 2} B. {3; 4} C. {1; 2; 3; 4; 5} D. {5}",
          "Câu 3. Phủ định của mệnh đề '∀x ∈ R, x² ≥ 0' là: A. ∃x ∈ R, x² < 0 B. ∃x ∈ R, x² ≤ 0 C. ∀x ∈ R, x² < 0 D. ∃x ∈ R, x² > 0",
          "Câu 4. Số tập con của tập hợp X = {a; b; c} là: A. 3 B. 6 C. 8 D. 9"
        ].join("\n"),
        approvedAnswers: null
      }
    ];

    const tx = db.transaction(async () => {
      for (const sample of sampleTests) {
        const buf = Buffer.from(sample.content, "utf8");
        const filename = `${sample.id}.txt`;
        if (documentsDir) {
          const filePath = path.join(documentsDir, filename);
          if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, buf);
          }
        }
        await db
          .prepare(`
            INSERT OR IGNORE INTO documents (
              id, subject, grade, category, title, filename, original_name, size, content_type, file_data
            ) VALUES (?, ?, ?, 'test', ?, ?, ?, ?, 'text/plain; charset=utf-8', ?)
          `)
          .run(sample.id, sample.subject, sample.grade, sample.title, filename, filename, buf.length, buf);

        const parsedQ = parseQuestionsFromRawText(sample.content);
        const targets = buildQuestionTargetsForTest({ parsedQuestions: parsedQ });

        await db
          .prepare(`
            INSERT OR IGNORE INTO tests (
              id, document_id, title, subject, grade, open_at, close_at,
              duration_minutes, answer_mode, has_answer_key, raw_text_cache, questions_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            sample.id,
            sample.id,
            sample.title,
            sample.subject,
            sample.grade,
            sample.openAt,
            sample.closeAt,
            sample.durationMinutes,
            sample.answerMode,
            sample.hasAnswerKey,
            sample.content,
            JSON.stringify(targets)
          );

        if (sample.approvedAnswers) {
          const questions = targets.map((t) => ({
            targetId: t.targetId,
            questionId: t.questionId,
            type: t.type,
            maximumPoints: sample.approvedPoints?.[t.targetId] || t.maximumPoints || 2.5,
            questionText: t.questionText,
            aiAnswer: sample.approvedAnswers[t.targetId] || "",
            answer: sample.approvedAnswers[t.targetId] || "",
            explanation: `Đáp án chuẩn câu ${t.targetId}: ${sample.approvedAnswers[t.targetId]}`,
            rubric: [
              {
                criterion: `Chọn đúng đáp án ${sample.approvedAnswers[t.targetId]}`,
                points: sample.approvedPoints?.[t.targetId] || 2.5
              }
            ],
            confidence: 1,
            uncertainty: "",
            reviewStatus: "manual"
          }));
          const approvedPayload = {
            schemaVersion: 1,
            source: "manual-entry",
            model: "manual",
            version: 1,
            scale: 10,
            answers: sample.approvedAnswers,
            points: sample.approvedPoints || {},
            questions,
            reviewedAt: new Date().toISOString()
          };
          await db
            .prepare(`
              INSERT OR IGNORE INTO exam_solutions (
                document_id, status, progress, phase, model, generated_json, approved_json, solution_version, generated_at, approved_at
              ) VALUES (?, 'ready', 100, 'Đã duyệt, sẵn sàng chấm', 'manual', ?, ?, 1, datetime('now'), datetime('now'))
            `)
            .run(
              sample.id,
              JSON.stringify({
                ...approvedPayload,
                answerCount: questions.length,
                requiredCount: questions.length
              }),
              JSON.stringify(approvedPayload)
            );
        }
      }
      await db.prepare("INSERT OR IGNORE INTO app_migrations(name) VALUES(?)").run(migrationName);
    });
    await tx();
  }

  async function initTestsModuleDatabase() {
    await ensureTables();
    await initResultsDatabase(db);
    await seedInitialSampleTests();
    await syncFromMainDatabase(db);
  }

  async function initManualSolutionForDocument(documentId) {
    const doc = await db
      .prepare(`
        SELECT d.*, t.raw_text_cache AS testRawText, t.questions_json AS testQuestionsJson,
               ak.normalized_json AS referenceAnswerJson
        FROM documents d
        LEFT JOIN tests t ON t.id = d.id
        LEFT JOIN answer_keys ak ON ak.document_id = d.id
        WHERE d.id = ?
      `)
      .get(String(documentId));

    if (!doc) throw new Error("Không tìm thấy đề bài.");

    const config = assessmentConfigFor(doc.subject, doc.category === "test" ? "exam" : doc.category);
    const sourceBuffer = getDocumentBuffer ? await getDocumentBuffer(doc) : Buffer.from(doc.file_data || []);
    const rawText = doc.testRawText || (await extractRawTextFromBuffer(sourceBuffer, doc.original_name));
    const parsedQuestions = parseQuestionsFromRawText(rawText);

    let targets = [];
    if (doc.testQuestionsJson) {
      try {
        const cached = JSON.parse(doc.testQuestionsJson);
        if (Array.isArray(cached) && cached.length) targets = cached;
      } catch {}
    }
    if (!targets.length) {
      targets = buildQuestionTargetsForTest({
        parsedQuestions,
        layout: config?.layout
      });
    }

    let refAnswers = {};
    try {
      const parsedRef = JSON.parse(doc.referenceAnswerJson || "null");
      if (parsedRef?.answers) refAnswers = parsedRef.answers;
    } catch {}

    const existingSol = await db
      .prepare("SELECT generated_json, approved_json, solution_version FROM exam_solutions WHERE document_id = ?")
      .get(String(documentId));
    const existingMap = new Map();
    if (existingSol) {
      try {
        const prev = JSON.parse(existingSol.approved_json || existingSol.generated_json || "null");
        for (const q of prev?.questions || []) {
          if (q?.targetId) existingMap.set(String(q.targetId), q);
        }
      } catch {}
    }

    const questions = targets.map((target) => {
      const prev = existingMap.get(target.targetId);
      const refAns =
        refAnswers[target.targetId] != null
          ? Array.isArray(refAnswers[target.targetId])
            ? refAnswers[target.targetId][0]
            : String(refAnswers[target.targetId])
          : "";
      const defaultAnswer =
        prev?.answer ||
        refAns ||
        (target.type === "multiple_choice" ? "A" : target.type === "true_false" ? "true" : "");
      const maxPts = Number(target.maximumPoints) || (target.type === "essay" ? 0.5 : 0.25);
      return {
        targetId: target.targetId,
        questionId: target.questionId,
        ...(target.statement ? { statement: target.statement } : {}),
        type: target.type,
        maximumPoints: maxPts,
        questionText:
          prev?.questionText && !prev.questionText.includes("Không đọc được")
            ? prev.questionText
            : target.questionText,
        aiAnswer: defaultAnswer,
        answer: defaultAnswer,
        referenceAnswer: refAns,
        explanation: prev?.explanation || "",
        rubric:
          Array.isArray(prev?.rubric) && prev.rubric.length
            ? prev.rubric
            : [{ criterion: `Đáp án đúng cho câu ${target.targetId}`, points: maxPts }],
        confidence: 1,
        uncertainty: "",
        reviewStatus: "manual"
      };
    });

    const manualPayload = {
      schemaVersion: 1,
      source: "manual-entry",
      provider: "manual",
      model: "Nhập thủ công",
      scale: Number(config?.grading?.scale) || 10,
      generatedAt: new Date().toISOString(),
      questions,
      answerCount: questions.filter((q) => String(q.answer || "").trim()).length,
      requiredCount: questions.length
    };

    await db
      .prepare(`
        INSERT INTO exam_solutions (
          document_id, status, progress, phase, model, generated_json, solution_version, generated_at, updated_at
        ) VALUES (?, 'review', 100, 'Nhập đáp án thủ công', 'Nhập thủ công', ?, 1, datetime('now'), datetime('now'))
        ON CONFLICT(document_id) DO UPDATE SET
          status = 'review',
          progress = 100,
          phase = 'Nhập đáp án thủ công',
          model = 'Nhập thủ công',
          generated_json = excluded.generated_json,
          error_code = NULL,
          error_message = NULL,
          generated_at = datetime('now'),
          updated_at = datetime('now')
      `)
      .run(String(documentId), JSON.stringify(manualPayload));

    return manualPayload;
  }

  app.post("/api/admin/documents/:id/solution/manual", requireSameOrigin, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id);
      if (isSubordinateAdmin(req)) {
        const ownedDocument = await db
          .prepare("SELECT id FROM documents WHERE id = ? AND uploaded_by = ?")
          .get(id, req.user.id);
        if (!ownedDocument) {
          return res.status(404).json({ error: "Không tìm thấy tài liệu hoặc bạn không có quyền quản lý tài liệu này." });
        }
      }
      const payload = await initManualSolutionForDocument(id);
      return res.json({
        ok: true,
        id,
        status: "review",
        mode: "manual",
        requiredCount: payload.requiredCount
      });
    } catch (error) {
      return res
        .status(400)
        .json({ error: error.message || "Không thể khởi tạo chế độ nhập đáp án thủ công." });
    }
  });

  async function getApprovedAnswerKeyForTest(testId) {
    const row = await db
      .prepare(`
        SELECT t.id, t.subject, t.grade, t.answer_mode, t.has_answer_key, t.questions_json,
               ak.normalized_json AS normalizedAnswerKey,
               es.status AS solutionStatus, es.approved_json AS approvedSolution
        FROM tests t
        LEFT JOIN answer_keys ak ON ak.document_id = t.id
        LEFT JOIN exam_solutions es ON es.document_id = t.id
        WHERE t.id = ?
      `)
      .get(String(testId));

    if (!row) return null;

    if (row.approvedSolution && (row.solutionStatus === "ready" || row.has_answer_key)) {
      try {
        const parsed = JSON.parse(row.approvedSolution);
        if (parsed?.answers && Object.keys(parsed.answers).length) {
          const points = { ...(parsed.points || {}) };
          for (const q of parsed.questions || []) {
            if (q?.targetId && Number(q.maximumPoints) > 0 && !points[q.targetId]) {
              points[q.targetId] = Number(q.maximumPoints);
            }
          }
          return { answers: parsed.answers, points, questions: parsed.questions || [] };
        }
      } catch {}
    }

    if (row.normalizedAnswerKey && (row.answer_mode !== "deferred" || row.has_answer_key)) {
      try {
        const parsed = JSON.parse(row.normalizedAnswerKey);
        if (parsed?.answers && Object.keys(parsed.answers).length) {
          return { answers: parsed.answers, points: parsed.points || {}, questions: [] };
        }
      } catch {}
    }

    return null;
  }

  function resolveSubmittedValue(submittedAnswers, target) {
    if (!submittedAnswers || typeof submittedAnswers !== "object") return "";
    const targetId = String(target.targetId || "");
    const questionId = String(target.questionId || "");
    if (submittedAnswers[targetId] !== undefined) return String(submittedAnswers[targetId] ?? "").trim();
    if (questionId && submittedAnswers[questionId] !== undefined) {
      return String(submittedAnswers[questionId] ?? "").trim();
    }

    const stmt = target.statement || (/^[ivx0-9]+-\d+([a-d])$/i.exec(targetId)?.[1]?.toLowerCase() || "");
    const num =
      target.number != null ? String(target.number) : /^[ivx0-9]+-(\d+)/i.exec(targetId)?.[1] || "";
    if (stmt && num) {
      for (const alias of [`${num}${stmt}`, `${num}.${stmt}`, `${num}-${stmt}`, `cau${num}${stmt}`]) {
        if (submittedAnswers[alias] !== undefined) return String(submittedAnswers[alias] ?? "").trim();
      }
    } else if (num && String(target.sectionId || "I") === "I") {
      for (const alias of [num, `cau${num}`, `q${num}`, `Câu ${num}`]) {
        if (submittedAnswers[alias] !== undefined) return String(submittedAnswers[alias] ?? "").trim();
      }
    }
    return "";
  }

  function resolveExpectedValue(answerKey, target, overrideObj = {}) {
    if (overrideObj?.answer !== undefined && String(overrideObj.answer ?? "").trim() !== "") {
      return overrideObj.answer;
    }
    const answers = answerKey?.answers;
    if (!answers || typeof answers !== "object") return "";
    const targetId = String(target.targetId || "");
    const questionId = String(target.questionId || "");
    if (answers[targetId] !== undefined) return answers[targetId];
    if (questionId && answers[questionId] !== undefined) return answers[questionId];
    const num =
      target.number != null ? String(target.number) : /^[ivx0-9]+-(\d+)/i.exec(targetId)?.[1] || "";
    if (num && String(target.sectionId || "I") === "I" && !target.statement) {
      if (answers[num] !== undefined) return answers[num];
    }
    return "";
  }

  function evaluateTestSubmission({ testRow, submittedAnswers, answerKey, questionOverrides = null }) {
    const config = assessmentConfigFor(testRow.subject, "exam");
    let targets = [];
    try {
      targets = JSON.parse(testRow.questions_json || "[]");
    } catch {}
    if (!Array.isArray(targets) || !targets.length) {
      targets = buildQuestionTargetsForTest({
        parsedQuestions: parseQuestionsFromRawText(testRow.raw_text_cache || ""),
        layout: config?.layout
      });
    }

    const effectiveOverrides =
      Array.isArray(questionOverrides) && questionOverrides.length
        ? questionOverrides
        : Array.isArray(answerKey?.questions) && answerKey.questions.length
          ? answerKey.questions
          : null;

    const isShortCustomTest =
      targets.length > 0 && targets.length <= 15 && !targets.some((t) => t.type === "true_false");

    let totalPoints = 0;
    let earnedPoints = 0;
    let correctCount = 0;
    const results = [];

    const tfGroups = new Map();
    const overrideMap = new Map((effectiveOverrides || []).map((item) => [String(item.targetId), item]));

    for (const target of targets) {
      const targetId = String(target.targetId);
      const ov = overrideMap.get(targetId) || {};
      const type = String(ov.type || target.type || "multiple_choice").toLowerCase();
      const stmtLetter =
        target.statement || (/^[ivx0-9]+-\d+([a-d])$/i.exec(targetId)?.[1]?.toLowerCase() || "");
      const questionId =
        target.questionId && target.questionId !== targetId
          ? String(target.questionId)
          : type === "true_false" && stmtLetter
            ? targetId.slice(0, -1)
            : targetId;

      const rawExpected = resolveExpectedValue(answerKey, target, ov);
      const expectedList = Array.isArray(rawExpected)
        ? rawExpected.map((v) => String(v ?? "").trim()).filter(Boolean)
        : [String(rawExpected ?? "").trim()].filter(Boolean);
      const expectedAns = expectedList[0] || "";
      const userAns = resolveSubmittedValue(submittedAnswers, target);

      const isMatch = expectedList.length > 0 && expectedList.some((exp) => answersMatch(exp, userAns, type));

      if (type === "true_false" && stmtLetter) {
        if (!tfGroups.has(questionId)) {
          tfGroups.set(questionId, {
            questionId,
            maximumPoints: 1.0,
            statements: [],
            manualPointsSum: 0,
            hasManualPoints: false
          });
        }
        const grp = tfGroups.get(questionId);
        grp.statements.push({
          targetId,
          statement: stmtLetter,
          correct: isMatch,
          userAnswer: userAns,
          expectedAnswer: expectedList.length ? expectedList : [expectedAns],
          explanation: ov.explanation || ""
        });
        if (ov.pointsAwarded !== undefined && ov.pointsAwarded !== null && ov.pointsAwarded !== "") {
          grp.hasManualPoints = true;
          grp.manualPointsSum += Number(ov.pointsAwarded) || 0;
        }
        continue;
      }

      const defaultTypePts = isShortCustomTest
        ? Number((10 / Math.max(1, targets.length)).toFixed(2))
        : type === "essay"
          ? 0.5
          : 0.25;
      const maxPts =
        Number(ov.maximumPoints ?? answerKey?.points?.[targetId] ?? target.maximumPoints) || defaultTypePts;
      const hasManualOverride =
        ov.pointsAwarded !== undefined && ov.pointsAwarded !== null && ov.pointsAwarded !== "";
      const awarded = hasManualOverride
        ? Math.max(0, Math.min(maxPts, Number(ov.pointsAwarded) || 0))
        : isMatch
          ? maxPts
          : 0;

      totalPoints += maxPts;
      earnedPoints += awarded;
      const correct = awarded >= maxPts - 0.001 && maxPts > 0;
      if (correct) correctCount++;

      results.push({
        question: targetId,
        type,
        correct,
        userAnswer: userAns,
        expectedAnswer: expectedList.length ? expectedList : [expectedAns],
        earnedPoints: Math.round(awarded * 100) / 100,
        totalPoints: Math.round(maxPts * 100) / 100,
        ...(hasManualOverride ? { manualPointsOverride: Math.round(awarded * 100) / 100 } : {}),
        explanation: ov.explanation || ""
      });
    }

    for (const grp of tfGroups.values()) {
      const correctStmtCount = grp.statements.filter((s) => s.correct).length;
      const weights = { 0: 0, 1: 0.1, 2: 0.25, 3: 0.5, 4: 1.0 };
      const maxPts = 1.0;
      const awarded = grp.hasManualPoints
        ? Math.max(0, Math.min(maxPts, grp.manualPointsSum))
        : weights[correctStmtCount] ?? 0;
      totalPoints += maxPts;
      earnedPoints += awarded;
      const correct = correctStmtCount === grp.statements.length;
      if (correct) correctCount++;
      results.push({
        question: grp.questionId,
        type: "true_false",
        correct,
        correctStatements: correctStmtCount,
        statementCount: grp.statements.length,
        statements: grp.statements,
        earnedPoints: Math.round(awarded * 100) / 100,
        totalPoints: maxPts
      });
    }

    const scale = 10;
    const roundedEarned = Math.round(earnedPoints * 100) / 100;
    const roundedTotal = Math.round(totalPoints * 100) / 100 || 10;
    const scaledScore =
      Math.abs(roundedTotal - scale) > 0.01
        ? Math.round((roundedEarned / roundedTotal) * scale * 100) / 100
        : roundedEarned;
    const percent = Math.round((scaledScore / scale) * 100);

    return {
      graded: true,
      gradingStatus: "graded",
      score: scaledScore,
      scale,
      earnedPoints: roundedEarned,
      totalPoints: roundedTotal,
      percent,
      correctCount,
      questionCount: results.length,
      results
    };
  }

  async function regradeTestSubmissionsForTest(testId, reviewerUser = null) {
    const id = String(testId || "");
    const testRow = await db.prepare("SELECT * FROM tests WHERE id = ?").get(id);
    if (!testRow) return { gradedCount: 0, newlyGradedCount: 0 };

    await db.prepare("UPDATE tests SET has_answer_key = 1 WHERE id = ?").run(id);
    const approvedKey = await getApprovedAnswerKeyForTest(id);
    if (!approvedKey) return { gradedCount: 0, newlyGradedCount: 0 };

    const submissions = await db
      .prepare(`
        SELECT ts.*, u.name AS userName, u.email AS userEmail
        FROM test_submissions ts
        JOIN users u ON u.id = ts.user_id
        WHERE ts.test_id = ?
      `)
      .all(id);

    if (!submissions.length) return { gradedCount: 0, newlyGradedCount: 0 };

    const nowIso = new Date().toISOString();
    const reviewerId = reviewerUser?.id || null;
    const reviewerName = reviewerUser?.name || "Giảng viên";
    let newlyGradedCount = 0;

    const tx = db.transaction(async () => {
      for (const sub of submissions) {
        const wasPending = sub.grading_status === "pending_grade" || !sub.graded;
        let studentAns = {};
        try {
          studentAns = JSON.parse(sub.answers_json || "{}");
        } catch {}

        const evaluated = evaluateTestSubmission({
          testRow,
          submittedAnswers: studentAns,
          answerKey: approvedKey,
          questionOverrides: (approvedKey.questions || []).map((q) => ({ ...q, pointsAwarded: undefined }))
        });

        const fullResult = {
          ...evaluated,
          submissionId: sub.id,
          attemptId: sub.id,
          isTest: true,
          testId: sub.test_id,
          title: sub.title,
          subject: sub.subject,
          grade: sub.grade,
          gradedBy: reviewerName,
          gradedAt: nowIso,
          teacherNote: sub.teacher_note || "",
          saved: true
        };

        await db
          .prepare(`
            UPDATE test_submissions
            SET grading_status = 'graded',
                graded = 1,
                score = ?,
                scale = ?,
                percent = ?,
                correct_count = ?,
                question_count = ?,
                answer_key_json = ?,
                result_json = ?,
                graded_at = datetime('now'),
                graded_by = COALESCE(?, graded_by)
            WHERE id = ?
          `)
          .run(
            Number(evaluated.score),
            Number(evaluated.scale || 10),
            Number(evaluated.percent || 0),
            Number(evaluated.correctCount || 0),
            Number(evaluated.questionCount || 0),
            JSON.stringify({ answers: approvedKey.answers, points: approvedKey.points || {} }),
            JSON.stringify(fullResult),
            reviewerId,
            sub.id
          );

        await db
          .prepare(`
            UPDATE user_progress
            SET score = ?, status = 'completed', progress_percent = 100, updated_at = datetime('now')
            WHERE user_id = ? AND item_type = 'test' AND item_id = ?
          `)
          .run(Number(evaluated.score), sub.user_id, sub.test_id);

        await db
          .prepare(`
            UPDATE exam_attempts
            SET graded = 1, score = ?, scale = ?, percent = ?, correct_count = ?, question_count = ?,
                answer_key_json = ?, result_json = ?
            WHERE user_id = ? AND document_id = ?
          `)
          .run(
            Number(evaluated.score),
            Number(evaluated.scale || 10),
            Number(evaluated.percent || 0),
            Number(evaluated.correctCount || 0),
            Number(evaluated.questionCount || 0),
            JSON.stringify({ answers: approvedKey.answers, points: approvedKey.points || {} }),
            JSON.stringify(fullResult),
            sub.user_id,
            sub.test_id
          );

        await upsertLearningResult({
          recordKey: `test:${sub.test_id}:user:${sub.user_id}`,
          userId: sub.user_id,
          userName: sub.userName,
          userEmail: sub.userEmail,
          subject: sub.subject,
          grade: sub.grade,
          category: "test",
          itemId: sub.test_id,
          itemTitle: sub.title,
          attemptId: sub.id,
          completionStatus: "completed",
          gradingStatus: "graded",
          progressPercent: 100,
          score: Number(evaluated.score),
          scale: Number(evaluated.scale || 10),
          percentScore: Number(evaluated.percent || 0),
          correctCount: evaluated.correctCount,
          questionCount: evaluated.questionCount,
          durationMinutes: sub.duration_minutes,
          timeSpentSeconds: sub.time_spent_seconds,
          fullscreenExitAutoSubmit: Boolean(sub.auto_submitted_fullscreen),
          openAt: testRow.open_at,
          closeAt: testRow.close_at,
          submittedAt: sub.submitted_at,
          gradedAt: nowIso,
          gradedById: reviewerId,
          gradedByName: reviewerName
        });

        if (wasPending) {
          newlyGradedCount++;
          await notifyUser(
            sub.user_id,
            "test_graded",
            `Đã có điểm: ${sub.title}`,
            `Giảng viên đã duyệt đáp án và chấm bài kiểm tra "${sub.title}" của bạn. Điểm số: ${Number(
              evaluated.score
            ).toFixed(2)}/${evaluated.scale || 10}.`
          );
        }
      }
    });
    await tx();

    return { gradedCount: submissions.length, newlyGradedCount };
  }

  app.get("/api/tests", async (req, res) => {
    try {
      const subordinateAdmin = isSubordinateAdmin(req);
      const rows = await db
        .prepare(`
          SELECT t.*,
                 d.filename, d.original_name AS originalName, d.size, d.content_type AS contentType,
                 es.status AS solutionStatus, es.phase AS solutionPhase, es.model AS solutionModel, es.progress AS solutionProgress,
                 ak.original_name AS answerKeyOriginalName,
                 (SELECT COUNT(*) FROM test_submissions ts WHERE ts.test_id = t.id) AS totalSubmissionsCount,
                 (SELECT COUNT(*) FROM test_submissions ts WHERE ts.test_id = t.id AND ts.grading_status = 'pending_grade') AS pendingGradingCount
          FROM tests t
          JOIN documents d ON d.id = t.document_id
          LEFT JOIN exam_solutions es ON es.document_id = t.id
          LEFT JOIN answer_keys ak ON ak.document_id = t.id
          ${subordinateAdmin ? "WHERE t.created_by = ?" : ""}
          ORDER BY t.open_at DESC, t.created_at DESC
        `)
        .all(...(subordinateAdmin ? [req.user.id] : []));

      let visibleRows = rows;
      let newCount = 0;
      if (req.user?.id) {
        const account = await db.prepare("SELECT account_type,role FROM users WHERE id=?").get(req.user.id);
        if (account?.account_type === "school" && account?.role === "student") {
          const memberships = await db.prepare("SELECT class_code FROM school_class_members WHERE user_id=?").all(req.user.id);
          const classCodes = memberships.map(item => String(item.class_code));
          visibleRows = rows.filter(row => !row.class_code || classCodes.includes(String(row.class_code)));
          newCount = visibleRows.filter(row => row.class_code && new Date(row.open_at).getTime() <= Date.now() &&
            new Date(row.close_at).getTime() >= Date.now()).length;
        }
      }

      const userSubmissionsByTest = new Map();
      if (req.user?.id) {
        const subs = await db
          .prepare(`
            SELECT *
            FROM test_submissions
            WHERE user_id = ?
            ORDER BY id DESC
          `)
          .all(req.user.id);
        for (const s of subs) {
          if (!userSubmissionsByTest.has(s.test_id)) {
            userSubmissionsByTest.set(s.test_id, s);
          }
        }
      }

      const nowMs = Date.now();
      const parseTimeMs = (val) => {
        if (!val) return null;
        const d = new Date(val);
        return Number.isNaN(d.getTime()) ? null : d.getTime();
      };

      const formatted = visibleRows.map((row) => {
        const sub = userSubmissionsByTest.get(row.id) || null;
        const completed = Boolean(sub);
        const openMs = parseTimeMs(row.open_at);
        const closeMs = parseTimeMs(row.close_at);
        const isNotOpenYet = openMs != null && nowMs < openMs;
        const isExpired = closeMs != null && nowMs > closeMs;
        const hasApprovedAnswers = Boolean(
          row.has_answer_key ||
            row.solutionStatus === "ready" ||
            (row.answerKeyOriginalName && row.answer_mode !== "deferred")
        );
        const solutionMode =
          row.solutionModel === "Nhập thủ công" || row.solutionPhase === "Nhập đáp án thủ công"
            ? "manual"
            : "ai";

        let parsedTargets = [];
        try {
          parsedTargets = JSON.parse(row.questions_json || "[]");
        } catch {}

        return {
          id: row.id,
          documentId: row.document_id,
          title: row.title,
          subject: row.subject,
          grade: row.grade,
          classCode: row.class_code || null,
          category: "test",
          openAt: row.open_at,
          closeAt: row.close_at,
          durationMinutes: row.duration_minutes ? Number(row.duration_minutes) : null,
          answerMode: row.answer_mode,
          hasApprovedAnswers,
          solutionStatus:
            row.solutionStatus || (row.answer_mode === "deferred" ? "deferred" : "not_started"),
          solutionMode,
          solutionPhase: row.solutionPhase || null,
          solutionProgress: Number(row.solutionProgress) || 0,
          filename: row.filename,
          originalName: row.originalName,
          fileUrl: `/api/documents/${encodeURIComponent(row.id)}/file`,
          url: `/api/documents/${encodeURIComponent(row.id)}/file`,
          content:
            /\.txt$/i.test(row.originalName || "") && row.raw_text_cache ? row.raw_text_cache : undefined,
          questionCount: parsedTargets.length || 22,
          questionTargets: parsedTargets,
          completed,
          completionStatus: completed ? "completed" : "incomplete",
          completionLabel: completed ? "Đã hoàn thành" : "Chưa hoàn thành",
          availability: isNotOpenYet ? "upcoming" : isExpired ? "closed" : "open",
          totalSubmissionsCount: Number(row.totalSubmissionsCount) || 0,
          pendingGradingCount: Number(row.pendingGradingCount) || 0,
          submission: sub
            ? {
                id: Number(sub.id),
                gradingStatus: sub.grading_status,
                graded: Boolean(sub.graded),
                score: sub.graded && sub.score != null ? Number(sub.score) : null,
                scale: Number(sub.scale || 10),
                percent: sub.percent != null ? Number(sub.percent) : null,
                correctCount: sub.correct_count != null ? Number(sub.correct_count) : null,
                questionCount: sub.question_count != null ? Number(sub.question_count) : null,
                submittedAt: sub.submitted_at,
                gradedAt: sub.graded_at,
                autoSubmittedFullscreen: Boolean(sub.auto_submitted_fullscreen)
              }
            : null
        };
      });

      formatted.sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        if (!a.completed) {
          const aClose = parseTimeMs(a.closeAt) || Number.MAX_SAFE_INTEGER;
          const bClose = parseTimeMs(b.closeAt) || Number.MAX_SAFE_INTEGER;
          return aClose - bClose;
        }
        const aSub = parseTimeMs(a.submission?.submittedAt) || 0;
        const bSub = parseTimeMs(b.submission?.submittedAt) || 0;
        return bSub - aSub;
      });

      res.setHeader("Cache-Control", "no-store");
      return res.json({
        tests: formatted,
        newCount,
        summary: {
          total: formatted.length,
          incompleteCount: formatted.filter((t) => !t.completed).length,
          completedCount: formatted.filter((t) => t.completed).length,
          pendingGradingTotal: rows.reduce((acc, r) => acc + (Number(r.pendingGradingCount) || 0), 0)
        }
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Không thể tải danh sách bài kiểm tra." });
    }
  });

  app.post(
    "/api/admin/tests",
    requireSameOrigin,
    requireAdmin,
    upload.fields([
      { name: "document", maxCount: 1 },
      { name: "answerKey", maxCount: 1 }
    ]),
    async (req, res) => {
      const uploadedR2Keys = [];
      let createdTestId = null;
      let createdLocalPath = null;
      try {
        const documentFile = req.files?.document?.[0];
        const answerKeyFile = req.files?.answerKey?.[0];
        if (!documentFile) {
          return res.status(400).json({ error: "Vui lòng chọn tệp đề bài kiểm tra." });
        }

        const b = req.body || {};
        const classCode = String(b.classCode || "").trim().toUpperCase();
        const isValidClass = /^(10A[1-9]|11B[1-9]|12C[1-9])$/.test(classCode);
        const title = String(b.title || documentFile.originalname || "").trim().slice(0, 140);
        const subject = String(b.subject || "Toán").trim();
        const grade = String(b.grade || "10").trim();
        const openAt = String(b.openAt || "").trim();
        const closeAt = String(b.closeAt || "").trim();
        const rawDuration = String(b.durationMinutes ?? "").trim();
        const durationMinutes =
          rawDuration === "" || rawDuration === "0" || rawDuration === "none" ? null : Number(rawDuration);
        const answerMode = String(b.answerMode || "immediate").trim() === "deferred" ? "deferred" : "immediate";
        const answerEntryMethod = String(b.answerEntryMethod || "manual").trim();

        if (!title) {
          return res.status(400).json({ error: "Vui lòng nhập tên bài kiểm tra." });
        }
        if (req.user?.role === "teacher") {
          const teacher = await db.prepare("SELECT account_type FROM users WHERE id=?").get(req.user.id);
          if (teacher?.account_type === "school") {
            if (!isValidClass) return res.status(400).json({ error: "Giáo viên trường cần chọn lớp nhận bài kiểm tra." });
            const assigned = await db.prepare("SELECT id FROM school_teacher_assignments WHERE teacher_id=? AND class_code=? LIMIT 1").get(req.user.id, classCode);
            if (!assigned) return res.status(403).json({ error: "Bạn chỉ được giao bài kiểm tra cho lớp đã được phân công." });
          }
        }
        if (classCode && !isValidClass) return res.status(400).json({ error: "Lớp nhận bài kiểm tra không hợp lệ." });
        if (!openAt || !closeAt) {
          return res
            .status(400)
            .json({ error: "Bắt buộc phải thiết lập Ngày mở bài kiểm tra và Hạn cuối nộp bài." });
        }
        const openDate = new Date(openAt);
        const closeDate = new Date(closeAt);
        if (Number.isNaN(openDate.getTime()) || Number.isNaN(closeDate.getTime())) {
          return res.status(400).json({ error: "Định dạng ngày mở hoặc hạn cuối nộp bài không hợp lệ." });
        }
        if (closeDate.getTime() <= openDate.getTime()) {
          return res.status(400).json({ error: "Hạn cuối nộp bài phải sau Ngày mở bài kiểm tra." });
        }
        if (durationMinutes !== null && !ALLOWED_DURATIONS.has(durationMinutes)) {
          return res.status(400).json({
            error: "Thời gian làm bài chỉ nhận các mốc: 30, 45, 60, 90, 120 phút hoặc không giới hạn."
          });
        }

        const ext = path.extname(documentFile.originalname).toLowerCase();
        const allowedDocExts = new Set([
          ".pdf",
          ".doc",
          ".docx",
          ".ppt",
          ".pptx",
          ".txt",
          ".png",
          ".jpg",
          ".jpeg"
        ]);
        if (!allowedDocExts.has(ext)) {
          return res.status(400).json({ error: "Định dạng tệp đề kiểm tra không được hỗ trợ." });
        }

        await ensureSubjectRegistered(subject, 10);
        const config = assessmentConfigFor(subject, "exam");
        const parsedAnswerKey = answerKeyFile
          ? await normalizeAnswerKeyDocument(
              answerKeyFile.buffer,
              answerKeyFile.originalname,
              config?.layout,
              config?.grading
            )
          : null;

        const rawText = await extractRawTextFromBuffer(documentFile.buffer, documentFile.originalname);
        const parsedQuestions = parseQuestionsFromRawText(rawText);
        const targets = buildQuestionTargetsForTest({
          parsedQuestions,
          layout: config?.layout
        });

        const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        createdTestId = id;
        const filename = storedFilename(documentFile.originalname);
        const contentType = contentTypeFor(documentFile.originalname);

        if (typeof saveFileToR2 !== "function") {
          const error = new Error(
            "Dịch vụ lưu trữ R2 chưa được khởi tạo. Vui lòng thử lại sau hoặc liên hệ quản trị viên."
          );
          error.code = "R2_NOT_CONFIGURED";
          error.statusCode = 503;
          throw error;
        }

        const documentR2Key = await saveFileToR2("tests", id, documentFile);
        if (typeof documentR2Key !== "string" || !documentR2Key.trim()) {
          const error = new Error(
            "R2 không trả về Object Key cho file đề. Bài kiểm tra chưa được tạo."
          );
          error.code = "R2_UPLOAD_NO_KEY";
          error.statusCode = 502;
          throw error;
        }
        uploadedR2Keys.push(documentR2Key);
        console.info(
          "[R2] test document uploaded",
          JSON.stringify({
            testId: id,
            objectKey: documentR2Key,
            bytes: documentFile.size
          })
        );

        let answerKeyR2Key = null;
        if (answerKeyFile) {
          answerKeyR2Key = await saveFileToR2("answer-keys", id, answerKeyFile);
          if (typeof answerKeyR2Key !== "string" || !answerKeyR2Key.trim()) {
            const error = new Error(
              "R2 không trả về Object Key cho file đáp án. Bài kiểm tra chưa được tạo."
            );
            error.code = "R2_UPLOAD_NO_KEY";
            error.statusCode = 502;
            throw error;
          }
          uploadedR2Keys.push(answerKeyR2Key);
          console.info(
            "[R2] test answer key uploaded",
            JSON.stringify({
              testId: id,
              objectKey: answerKeyR2Key,
              bytes: answerKeyFile.size
            })
          );
        }

        if (documentsDir) {
          createdLocalPath = path.join(documentsDir, filename);
          fs.writeFileSync(createdLocalPath, documentFile.buffer, { flag: "wx" });
        }

        const hasImmediateKey = Boolean(parsedAnswerKey && answerMode === "immediate");

        const saveTx = db.transaction(async () => {
          await db
            .prepare(`
              INSERT INTO documents (
                id, subject, grade, category, title, filename, original_name, size, content_type, file_data, r2_key, uploaded_by
              ) VALUES (?, ?, ?, 'test', ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              id,
              subject,
              grade,
              title,
              filename,
              documentFile.originalname,
              documentFile.size,
              contentType,
              documentFile.buffer,
              documentR2Key,
              req.user.id
            );

          await db
            .prepare(`
              INSERT INTO tests (
                id, document_id, title, subject, grade, open_at, close_at,
                duration_minutes, answer_mode, has_answer_key, raw_text_cache, questions_json, created_by, class_code
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              id,
              id,
              title,
              subject,
              grade,
              openAt,
              closeAt,
              durationMinutes,
              answerMode,
              hasImmediateKey ? 1 : 0,
              rawText || null,
              JSON.stringify(targets),
              req.user.id,
              isValidClass ? classCode : null
            );
        });
        await saveTx();

        if (isValidClass) {
          const members = await db.prepare(`
            SELECT m.user_id FROM school_class_members m
            JOIN users u ON u.id=m.user_id
            WHERE m.class_code=? AND u.account_type='school'
          `).all(classCode);
          await Promise.all(members.map(member => notifyUser?.(
            member.user_id,
            "new_class_test",
            `Bài kiểm tra mới: ${title}`,
            `Lớp ${classCode} có bài kiểm tra môn ${subject} mới.`,
            "/"
          )));
        }

        if (answerKeyFile) {
          await saveAnswerKeyRecord(id, answerKeyFile, req.user.id, parsedAnswerKey, answerKeyR2Key);
        }

        let solutionJob = null;
        if (answerMode === "immediate") {
          if (answerEntryMethod === "ai") {
            await createExamSolutionJob(id);
            solutionJob = { id, status: "queued", mode: "ai", phase: "AI đang giải đề kiểm tra" };
          } else {
            await initManualSolutionForDocument(id);
            solutionJob = { id, status: "review", mode: "manual", phase: "Nhập và xác nhận đáp án chuẩn" };
          }
        }

        return res.status(201).json({
          ok: true,
          testId: id,
          answerMode,
          solutionJob,
          message:
            answerMode === "deferred"
              ? "Đã tạo bài kiểm tra ở chế độ Chưa nhập đáp án ngay (Học viên nộp bài sẽ hiện 'Đang chờ chấm')."
              : answerEntryMethod === "ai"
                ? "Đã tạo bài kiểm tra. AI đang giải đề để giảng viên duyệt lại."
                : "Đã tạo bài kiểm tra. Hãy nhập và xác nhận bộ đáp án chuẩn."
        });
      } catch (error) {
        if (error?.code === "R2_NOT_CONFIGURED" || error?.code === "R2_UPLOAD_NO_KEY") {
          console.error(
            "[R2] test creation blocked",
            JSON.stringify({
              code: error.code,
              message: error.message
            })
          );
        }
        if (createdTestId) {
          try {
            await db.prepare("DELETE FROM tests WHERE id = ?").run(createdTestId);
            await db.prepare("DELETE FROM documents WHERE id = ?").run(createdTestId);
          } catch (cleanupError) {
            console.warn("[R2] Could not roll back test creation:", cleanupError.message);
          }
        }
        if (createdLocalPath && fs.existsSync(createdLocalPath)) {
          try {
            fs.unlinkSync(createdLocalPath);
          } catch {}
        }
        await Promise.all(uploadedR2Keys.map((key) => deleteFromR2?.(key).catch(() => {})));
        console.error("Create test error:", error);
        return res.status(400).json({ error: error.message || "Không thể tạo bài kiểm tra." });
      }
    }
  );

  app.delete("/api/admin/tests/:id", requireSameOrigin, requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const testRow = await db.prepare("SELECT id, title, created_by FROM tests WHERE id = ?").get(id);
    if (!testRow) return res.status(404).json({ error: "Không tìm thấy bài kiểm tra cần xóa." });
    if (isSubordinateAdmin(req) && Number(testRow.created_by) !== Number(req.user.id)) {
      return res.status(404).json({ error: "Không tìm thấy bài kiểm tra hoặc bạn không có quyền xóa bài này." });
    }
    const doc = await db.prepare("SELECT id, filename, r2_key FROM documents WHERE id = ?").get(id);
    const answerKey = await db.prepare("SELECT r2_key FROM answer_keys WHERE document_id = ?").get(id);

    const delTx = db.transaction(async () => {
      await db.prepare("DELETE FROM tests WHERE id = ?").run(id);
      await db.prepare("DELETE FROM documents WHERE id = ?").run(id);
      await db.prepare("DELETE FROM user_progress WHERE item_id = ?").run(id);
    });
    await delTx();
    await deleteLearningResultsByItemId(id);

    if (doc?.filename && documentsDir) {
      const storedPath = path.join(documentsDir, path.basename(doc.filename));
      try {
        if (fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
      } catch {}
    }
    if (doc?.r2_key) {
      await deleteFromR2?.(doc.r2_key).catch((error) =>
        console.warn("[R2] test document cleanup failed:", error.message)
      );
    }
    if (answerKey?.r2_key) {
      await deleteFromR2?.(answerKey.r2_key).catch((error) =>
        console.warn("[R2] test answer-key cleanup failed:", error.message)
      );
    }

    return res.json({
      ok: true,
      deletedId: id,
      message: `Đã xóa bài kiểm tra "${testRow?.title || id}".`
    });
  });

  app.post("/api/tests/:id/submit", requireSameOrigin, requireAuth, async (req, res) => {
    const testId = String(req.params.id);
    const testRow = await db
      .prepare(`
        SELECT t.*, d.original_name AS originalName
        FROM tests t
        JOIN documents d ON d.id = t.document_id
        WHERE t.id = ?
      `)
      .get(testId);

    if (!testRow) {
      return res.status(404).json({ error: "Không tìm thấy bài kiểm tra này." });
    }

    const nowMs = Date.now();
    const openMs = new Date(testRow.open_at).getTime();
    if (req.user.role === "student" && Number.isFinite(openMs) && nowMs < openMs) {
      return res.status(403).json({ error: "Bài kiểm tra này chưa đến thời gian mở đề." });
    }

    const rawAnswers =
      req.body?.answers && typeof req.body.answers === "object" && !Array.isArray(req.body.answers)
        ? req.body.answers
        : {};
    const answers = Object.fromEntries(
      Object.entries(rawAnswers)
        .slice(0, 250)
        .map(([k, v]) => [String(k).slice(0, 40), String(v ?? "").slice(0, 5000)])
    );
    const autoSubmittedFullscreen = Boolean(req.body?.autoSubmittedFullscreen);
    const timeSpentSeconds = Math.max(0, Math.round(Number(req.body?.timeSpentSeconds) || 0));

    const approvedKey = await getApprovedAnswerKeyForTest(testId);
    let resultPayload;

    if (approvedKey) {
      resultPayload = evaluateTestSubmission({
        testRow,
        submittedAnswers: answers,
        answerKey: approvedKey
      });
    } else {
      let targets = [];
      try {
        targets = JSON.parse(testRow.questions_json || "[]");
      } catch {}
      resultPayload = {
        graded: false,
        gradingStatus: "pending_grade",
        statusLabel: "Đang chờ chấm",
        scale: 10,
        questionCount: targets.length || Object.keys(answers).length || 0,
        answeredCount: Object.values(answers).filter((v) => String(v).trim() !== "").length,
        autoSubmittedFullscreen,
        message: "Đang chờ chấm — Bài kiểm tra của bạn đã được lưu và đang chờ giảng viên chấm điểm."
      };
    }

    const saveSubmissionTx = db.transaction(async () => {
      const inserted = await db
        .prepare(`
          INSERT INTO test_submissions (
            test_id, user_id, title, subject, grade,
            grading_status, graded, score, scale, percent,
            correct_count, question_count, duration_minutes, time_spent_seconds,
            auto_submitted_fullscreen, answers_json, answer_key_json, result_json,
            started_at, submitted_at, graded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
        `)
        .run(
          testRow.id,
          req.user.id,
          testRow.title,
          testRow.subject,
          testRow.grade,
          resultPayload.graded ? "graded" : "pending_grade",
          resultPayload.graded ? 1 : 0,
          resultPayload.graded ? Number(resultPayload.score) : null,
          Number(resultPayload.scale || 10),
          resultPayload.graded && resultPayload.percent != null ? Number(resultPayload.percent) : null,
          resultPayload.correctCount == null ? null : Number(resultPayload.correctCount),
          resultPayload.questionCount == null ? null : Number(resultPayload.questionCount),
          testRow.duration_minutes ? Number(testRow.duration_minutes) : null,
          timeSpentSeconds,
          autoSubmittedFullscreen ? 1 : 0,
          JSON.stringify(answers),
          approvedKey ? JSON.stringify({ answers: approvedKey.answers, points: approvedKey.points || {} }) : null,
          JSON.stringify(resultPayload),
          resultPayload.graded ? new Date().toISOString() : null
        );

      const submissionId = Number(inserted.lastInsertRowid);
      const fullPayload = {
        ...resultPayload,
        submissionId,
        attemptId: submissionId,
        isTest: true,
        testId: testRow.id,
        title: testRow.title,
        subject: testRow.subject,
        grade: testRow.grade,
        autoSubmittedFullscreen,
        saved: true
      };

      await db
        .prepare("UPDATE test_submissions SET result_json = ? WHERE id = ?")
        .run(JSON.stringify(fullPayload), submissionId);

      const attemptInsert = await db
        .prepare(`
          INSERT INTO exam_attempts (
            user_id, document_id, title, subject, grade, category,
            graded, score, scale, percent, correct_count, question_count,
            answers_json, answer_key_json, result_json
          ) VALUES (?, ?, ?, ?, ?, 'test', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          req.user.id,
          testRow.id,
          testRow.title,
          testRow.subject,
          testRow.grade,
          resultPayload.graded ? 1 : 0,
          resultPayload.graded ? Number(resultPayload.score) : null,
          Number(resultPayload.scale || 10),
          resultPayload.graded && resultPayload.percent != null ? Number(resultPayload.percent) : null,
          resultPayload.correctCount == null ? null : Number(resultPayload.correctCount),
          resultPayload.questionCount == null ? null : Number(resultPayload.questionCount),
          JSON.stringify(answers),
          approvedKey ? JSON.stringify({ answers: approvedKey.answers, points: approvedKey.points || {} }) : null,
          JSON.stringify(fullPayload)
        );
      const examAttemptId = Number(attemptInsert.lastInsertRowid);

      await db
        .prepare(`
          INSERT INTO user_progress (
            user_id, item_type, item_id, item_title, subject, grade,
            status, progress_percent, score, answers_json, last_position, updated_at
          ) VALUES (?, 'test', ?, ?, ?, ?, 'completed', 100, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, item_type, item_id) DO UPDATE SET
            item_title = excluded.item_title,
            subject = excluded.subject,
            grade = excluded.grade,
            status = 'completed',
            progress_percent = 100,
            score = excluded.score,
            answers_json = excluded.answers_json,
            last_position = excluded.last_position,
            updated_at = datetime('now')
        `)
        .run(
          req.user.id,
          testRow.id,
          testRow.title,
          testRow.subject,
          testRow.grade,
          resultPayload.graded ? Number(resultPayload.score) : null,
          JSON.stringify(answers),
          `test-submission:${submissionId}:attempt:${examAttemptId}`
        );

      await upsertLearningResult({
        recordKey: `test:${testRow.id}:user:${req.user.id}`,
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        subject: testRow.subject,
        grade: testRow.grade,
        category: "test",
        itemId: testRow.id,
        itemTitle: testRow.title,
        attemptId: submissionId,
        completionStatus: "completed",
        gradingStatus: resultPayload.graded ? "graded" : "pending_grade",
        progressPercent: 100,
        score: resultPayload.graded ? Number(resultPayload.score) : null,
        scale: Number(resultPayload.scale || 10),
        percentScore: resultPayload.graded ? Number(resultPayload.percent) : null,
        correctCount: resultPayload.correctCount,
        questionCount: resultPayload.questionCount,
        durationMinutes: testRow.duration_minutes,
        timeSpentSeconds,
        fullscreenExitAutoSubmit: autoSubmittedFullscreen,
        openAt: testRow.open_at,
        closeAt: testRow.close_at,
        submittedAt: new Date().toISOString(),
        gradedAt: resultPayload.graded ? new Date().toISOString() : null
      });

      if (resultPayload.graded) {
        await notifyUser(
          req.user.id,
          "test_graded",
          `Hoàn thành ${testRow.title}`,
          `Bạn đã nộp bài kiểm tra "${testRow.title}" và đạt ${Number(resultPayload.score).toFixed(2)}/${
            resultPayload.scale || 10
          } điểm.`
        );
      } else {
        await notifyUser(
          req.user.id,
          "test_pending_grade",
          `Đã nộp ${testRow.title} (Đang chờ chấm)`,
          `Bài làm "${testRow.title}" của bạn đã được ghi nhận và đang chờ giảng viên chấm điểm.`
        );
        const submissionNotice =
          `Học viên ${req.user.name} (${req.user.email}) vừa nộp bài "${testRow.title}" — đang chờ chấm điểm.`;
        // Notify the instructor who owns this test and the top-level admin only.
        // Other subordinate admins must not receive metadata about another instructor's test.
        const rootAdmins = await db
          .prepare("SELECT id FROM users WHERE role = 'admin' AND admin_level >= 2")
          .all();
        const notificationRecipients = new Set([
          ...(testRow.created_by ? [Number(testRow.created_by)] : []),
          ...rootAdmins.map((admin) => Number(admin.id))
        ]);
        await Promise.all(
          [...notificationRecipients]
            .filter((userId) => Number.isSafeInteger(userId) && userId > 0)
            .map((userId) =>
              notifyUser(
                userId,
                "test_submission_pending",
                "Có bài kiểm tra mới chờ chấm",
                submissionNotice
              )
            )
        );
      }

      return fullPayload;
    });

    return res.json(await saveSubmissionTx());
  });

  app.get("/api/test-submissions/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const subordinateAdmin = isSubordinateAdmin(req);
    const row =
      ["admin", "teacher"].includes(req.user.role)
        ? await db
            .prepare(`
              SELECT ts.*, u.name AS userName, u.email AS userEmail
              FROM test_submissions ts
              JOIN users u ON u.id = ts.user_id
              JOIN tests t ON t.id = ts.test_id
              WHERE ts.id = ? ${subordinateAdmin ? "AND t.created_by = ?" : ""}
            `)
            .get(...(subordinateAdmin ? [id, req.user.id] : [id]))
        : await db
            .prepare(`
              SELECT ts.*, u.name AS userName, u.email AS userEmail
              FROM test_submissions ts
              JOIN users u ON u.id = ts.user_id
              WHERE ts.id = ? AND ts.user_id = ?
            `)
            .get(id, req.user.id);

    if (!row) {
      return res.status(404).json({ error: "Không tìm thấy bài nộp kiểm tra." });
    }

    let result = {};
    let answers = {};
    let answerKey = null;
    try {
      result = JSON.parse(row.result_json || "{}");
    } catch {}
    try {
      answers = JSON.parse(row.answers_json || "{}");
    } catch {}
    try {
      answerKey = JSON.parse(row.answer_key_json || "null");
    } catch {}

    return res.json({
      id: Number(row.id),
      testId: row.test_id,
      documentId: row.test_id,
      title: row.title,
      subject: row.subject,
      grade: row.grade,
      category: "test",
      gradingStatus: row.grading_status,
      graded: Boolean(row.graded),
      score: row.graded && row.score != null ? Number(row.score) : null,
      scale: Number(row.scale || 10),
      percent: row.percent != null ? Number(row.percent) : null,
      answers,
      answerKey,
      result: {
        ...result,
        graded: Boolean(row.graded),
        gradingStatus: row.grading_status,
        score: row.graded && row.score != null ? Number(row.score) : null,
        scale: Number(row.scale || 10),
        percent: row.percent != null ? Number(row.percent) : null,
        message: row.graded
          ? result.message
          : "Đang chờ chấm — Bài kiểm tra của bạn đang chờ giảng viên chấm điểm."
      },
      createdAt: row.submitted_at,
      submittedAt: row.submitted_at,
      gradedAt: row.graded_at,
      userName: row.userName,
      userEmail: row.userEmail
    });
  });

  app.get("/api/admin/pending-test-submissions", requireAdmin, async (req, res) => {
    const statusFilter = String(req.query.status || "all");
    const subordinateAdmin = isSubordinateAdmin(req);
    const rows = await db
      .prepare(`
        SELECT ts.id, ts.test_id AS testId, ts.user_id AS userId,
               ts.title, ts.subject, ts.grade, ts.grading_status AS gradingStatus,
               ts.graded, ts.score, ts.scale, ts.percent,
               ts.correct_count AS correctCount, ts.question_count AS questionCount,
               ts.time_spent_seconds AS timeSpentSeconds,
               ts.auto_submitted_fullscreen AS autoSubmittedFullscreen,
               ts.submitted_at AS submittedAt, ts.graded_at AS gradedAt,
               u.name AS userName, u.email AS userEmail,
               g.name AS gradedByName
        FROM test_submissions ts
        JOIN users u ON u.id = ts.user_id
        JOIN tests t ON t.id = ts.test_id
        LEFT JOIN users g ON g.id = ts.graded_by
        ${subordinateAdmin ? "WHERE t.created_by = ?" : ""}
        ORDER BY
          CASE ts.grading_status WHEN 'pending_grade' THEN 0 ELSE 1 END,
          ts.submitted_at DESC
        LIMIT 300
      `)
      .all(...(subordinateAdmin ? [req.user.id] : []));

    const filtered =
      statusFilter === "pending_grade"
        ? rows.filter((r) => r.gradingStatus === "pending_grade")
        : statusFilter === "graded"
          ? rows.filter((r) => r.gradingStatus === "graded")
          : rows;

    return res.json({
      submissions: filtered,
      pendingCount: rows.filter((r) => r.gradingStatus === "pending_grade").length,
      gradedCount: rows.filter((r) => r.gradingStatus === "graded").length,
      totalCount: rows.length
    });
  });

  app.get("/api/admin/test-submissions/:id/grading-context", requireAdmin, async (req, res) => {
    const submissionId = Number(req.params.id);
    const subordinateAdmin = isSubordinateAdmin(req);
    const sub = await db
      .prepare(`
        SELECT ts.*, u.name AS userName, u.email AS userEmail,
               t.open_at AS openAt, t.close_at AS closeAt, t.duration_minutes AS durationMinutes,
               t.raw_text_cache AS rawTextCache, t.questions_json AS questionsJson,
               d.original_name AS originalName, d.file_data AS fileData, d.r2_key AS r2Key,
               ak.normalized_json AS referenceAnswerJson,
               es.status AS solutionStatus, es.phase AS solutionPhase, es.model AS solutionModel,
               es.approved_json AS approvedSolution, es.generated_json AS generatedSolution
        FROM test_submissions ts
        JOIN users u ON u.id = ts.user_id
        JOIN tests t ON t.id = ts.test_id
        JOIN documents d ON d.id = t.document_id
        LEFT JOIN answer_keys ak ON ak.document_id = t.id
        LEFT JOIN exam_solutions es ON es.document_id = t.id
        WHERE ts.id = ? ${subordinateAdmin ? "AND t.created_by = ?" : ""}
      `)
      .get(...(subordinateAdmin ? [submissionId, req.user.id] : [submissionId]));

    if (!sub) {
      return res.status(404).json({ error: "Không tìm thấy bài nộp cần chấm." });
    }

    const config = assessmentConfigFor(sub.subject, "exam");
    const sourceBuffer =
      sub.fileData ||
      (getDocumentBuffer
        ? await getDocumentBuffer({
            file_data: sub.fileData,
            r2_key: sub.r2Key,
            original_name: sub.originalName
          })
        : null);
    const rawText = sub.rawTextCache || (await extractRawTextFromBuffer(sourceBuffer, sub.originalName));
    const parsedQuestions = parseQuestionsFromRawText(rawText);

    let targets = [];
    if (sub.questionsJson) {
      try {
        const parsed = JSON.parse(sub.questionsJson);
        if (Array.isArray(parsed) && parsed.length) targets = parsed;
      } catch {}
    }
    if (!targets.length) {
      targets = buildQuestionTargetsForTest({
        parsedQuestions,
        layout: config?.layout
      });
    }

    let studentAnswers = {};
    try {
      studentAnswers = JSON.parse(sub.answers_json || "{}");
    } catch {}

    let savedAnswerKey = {};
    const savedQuestionMeta = new Map();
    try {
      const fromRef = JSON.parse(sub.referenceAnswerJson || "null");
      if (fromRef?.answers) savedAnswerKey = { ...fromRef.answers };
    } catch {}
    try {
      const fromSol = JSON.parse(sub.approvedSolution || sub.generatedSolution || "null");
      if (fromSol?.answers) savedAnswerKey = { ...savedAnswerKey, ...fromSol.answers };
      for (const q of fromSol?.questions || []) {
        if (q?.targetId) {
          savedQuestionMeta.set(String(q.targetId), q);
          if (q.answer && !savedAnswerKey[q.targetId]) {
            savedAnswerKey[q.targetId] = q.answer;
          }
        }
      }
    } catch {}
    try {
      const fromSub = JSON.parse(sub.answer_key_json || "null");
      if (fromSub?.answers) savedAnswerKey = { ...savedAnswerKey, ...fromSub.answers };
    } catch {}

    let prevResult = {};
    try {
      prevResult = JSON.parse(sub.result_json || "{}");
    } catch {}
    const prevResultByQuestion = new Map();
    for (const r of prevResult?.results || []) {
      if (r?.question) prevResultByQuestion.set(String(r.question), r);
      if (Array.isArray(r?.statements)) {
        for (const s of r.statements) {
          if (s?.targetId) prevResultByQuestion.set(String(s.targetId), s);
          else if (r.question && s?.statement) prevResultByQuestion.set(`${r.question}${s.statement}`, s);
        }
      }
    }

    const isShortCustomTest =
      targets.length > 0 && targets.length <= 15 && !targets.some((t) => t.type === "true_false");
    const questions = targets.map((target) => {
      const meta = savedQuestionMeta.get(target.targetId) || {};
      const prevRow =
        prevResultByQuestion.get(target.targetId) ||
        (!target.statement ? prevResultByQuestion.get(target.questionId) : null);
      const studentAns = resolveSubmittedValue(studentAnswers, target);
      const rawCorrectAns = savedAnswerKey[target.targetId] ?? meta.answer ?? "";
      const currentCorrectAns = Array.isArray(rawCorrectAns)
        ? String(rawCorrectAns[0] ?? "").trim()
        : String(rawCorrectAns ?? "").trim();
      const defaultTypePts = isShortCustomTest
        ? Number((10 / Math.max(1, targets.length)).toFixed(2))
        : target.type === "essay"
          ? 0.5
          : target.type === "true_false"
            ? 1
            : 0.25;
      const maxPts = Number(meta.maximumPoints ?? target.maximumPoints) || defaultTypePts;
      const rubric =
        Array.isArray(meta.rubric) && meta.rubric.length
          ? meta.rubric
          : [{ criterion: `Đáp án đúng cho câu ${target.targetId}`, points: maxPts }];

      return {
        targetId: target.targetId,
        questionId: target.questionId,
        ...(target.statement ? { statement: target.statement } : {}),
        type: target.type,
        maximumPoints: maxPts,
        questionText: meta.questionText || target.questionText || `Câu ${target.targetId}`,
        studentAnswer: studentAns,
        answer: currentCorrectAns,
        explanation: meta.explanation || prevRow?.explanation || "",
        rubric,
        earnedPoints: prevRow?.earnedPoints ?? null,
        manualPointsOverride: prevRow?.manualPointsOverride ?? null
      };
    });

    const solutionMode =
      sub.solutionModel === "Nhập thủ công" || sub.solutionPhase === "Nhập đáp án thủ công"
        ? "manual"
        : "ai";

    return res.json({
      submissionId: Number(sub.id),
      testId: sub.test_id,
      title: sub.title,
      subject: sub.subject,
      grade: sub.grade,
      originalName: sub.originalName,
      fileUrl: `/api/documents/${encodeURIComponent(sub.test_id)}/file`,
      userName: sub.userName,
      userEmail: sub.userEmail,
      submittedAt: sub.submitted_at,
      gradedAt: sub.graded_at,
      gradingStatus: sub.grading_status,
      graded: Boolean(sub.graded),
      score: sub.graded && sub.score != null ? Number(sub.score) : null,
      scale: Number(sub.scale || 10),
      timeSpentSeconds: sub.time_spent_seconds,
      autoSubmittedFullscreen: Boolean(sub.auto_submitted_fullscreen),
      teacherNote: sub.teacher_note || "",
      solutionStatus: sub.solutionStatus || "not_started",
      solutionMode,
      questions
    });
  });

  app.post("/api/admin/test-submissions/:id/grade", requireSameOrigin, requireAdmin, async (req, res) => {
    const submissionId = Number(req.params.id);
    const subordinateAdmin = isSubordinateAdmin(req);
    const sub = await db
      .prepare(`
        SELECT ts.*, u.name AS userName, u.email AS userEmail
        FROM test_submissions ts
        JOIN users u ON u.id = ts.user_id
        JOIN tests t ON t.id = ts.test_id
        WHERE ts.id = ? ${subordinateAdmin ? "AND t.created_by = ?" : ""}
      `)
      .get(...(subordinateAdmin ? [submissionId, req.user.id] : [submissionId]));

    if (!sub) {
      return res.status(404).json({ error: "Không tìm thấy bài nộp cần chấm." });
    }

    const testRow = await db.prepare("SELECT * FROM tests WHERE id = ?").get(sub.test_id);
    if (!testRow) {
      return res.status(404).json({ error: "Không tìm thấy đề kiểm tra gốc." });
    }

    const submittedQuestions = Array.isArray(req.body?.questions) ? req.body.questions : [];
    if (!submittedQuestions.length) {
      return res.status(400).json({ error: "Vui lòng nhập đáp án đúng cho các câu hỏi trước khi lưu điểm." });
    }

    const saveAsTestAnswerKey = req.body?.saveAsTestAnswerKey !== false;
    const teacherNote = String(req.body?.teacherNote || "").trim().slice(0, 1000);

    let baseTargets = [];
    try {
      baseTargets = JSON.parse(testRow.questions_json || "[]");
    } catch {}
    const baseTargetMap = new Map(
      (Array.isArray(baseTargets) ? baseTargets : []).map((t) => [String(t.targetId), t])
    );

    const answersMap = {};
    const pointsMap = {};
    const normalizedQuestions = [];

    for (const q of submittedQuestions) {
      const targetId = String(q.targetId || "").trim();
      if (!targetId) continue;
      const baseTarget = baseTargetMap.get(targetId) || {};
      const type = String(q.type || baseTarget.type || "multiple_choice").toLowerCase();
      const answer = String(q.answer ?? "").trim();
      const hasPointsOverride =
        q.pointsAwarded !== undefined && q.pointsAwarded !== null && q.pointsAwarded !== "";

      if (!answer && type !== "essay" && !hasPointsOverride) {
        return res.status(400).json({ error: `Vui lòng chọn hoặc nhập đáp án đúng cho câu ${targetId}.` });
      }
      if (answer) {
        answersMap[targetId] = answer;
      }
      const maxPts =
        Number(q.maximumPoints || baseTarget.maximumPoints) ||
        (type === "essay" ? 0.5 : type === "true_false" ? 1 : 0.25);
      pointsMap[targetId] = maxPts;
      normalizedQuestions.push({
        targetId,
        questionId: q.questionId || baseTarget.questionId || targetId,
        ...(baseTarget.statement || q.statement ? { statement: baseTarget.statement || q.statement } : {}),
        type,
        maximumPoints: maxPts,
        questionText: String(q.questionText || baseTarget.questionText || `Câu ${targetId}`),
        aiAnswer: answer,
        answer,
        explanation: String(q.explanation || "").trim(),
        rubric:
          Array.isArray(q.rubric) && q.rubric.length
            ? q.rubric
            : [{ criterion: `Đáp án chuẩn câu ${targetId}`, points: maxPts }],
        pointsAwarded: hasPointsOverride ? Number(q.pointsAwarded) : undefined,
        confidence: 1,
        uncertainty: "",
        reviewStatus: "manual"
      });
    }

    let studentAnswers = {};
    try {
      studentAnswers = JSON.parse(sub.answers_json || "{}");
    } catch {}

    const evaluated = evaluateTestSubmission({
      testRow,
      submittedAnswers: studentAnswers,
      answerKey: { answers: answersMap, points: pointsMap },
      questionOverrides: normalizedQuestions
    });

    const nowIso = new Date().toISOString();
    const answerKeyPayload = {
      schemaVersion: 1,
      source: "manual-entry",
      model: "Giảng viên chấm",
      version: 1,
      scale: 10,
      answers: answersMap,
      points: pointsMap,
      questions: normalizedQuestions,
      reviewedAt: nowIso,
      reviewedBy: req.user.id
    };

    let autoGradedOthersCount = 0;

    const gradeTx = db.transaction(async () => {
      const fullResult = {
        ...evaluated,
        submissionId: sub.id,
        attemptId: sub.id,
        isTest: true,
        testId: sub.test_id,
        title: sub.title,
        subject: sub.subject,
        grade: sub.grade,
        gradedBy: req.user.name,
        gradedAt: nowIso,
        teacherNote,
        saved: true
      };

      await db
        .prepare(`
          UPDATE test_submissions
          SET grading_status = 'graded',
              graded = 1,
              score = ?,
              scale = ?,
              percent = ?,
              correct_count = ?,
              question_count = ?,
              answer_key_json = ?,
              result_json = ?,
              teacher_note = ?,
              graded_at = datetime('now'),
              graded_by = ?
          WHERE id = ?
        `)
        .run(
          Number(evaluated.score),
          Number(evaluated.scale || 10),
          Number(evaluated.percent || 0),
          Number(evaluated.correctCount || 0),
          Number(evaluated.questionCount || 0),
          JSON.stringify({ answers: answersMap, points: pointsMap }),
          JSON.stringify(fullResult),
          teacherNote || null,
          req.user.id,
          sub.id
        );

      await db
        .prepare(`
          UPDATE user_progress
          SET score = ?, status = 'completed', progress_percent = 100, updated_at = datetime('now')
          WHERE user_id = ? AND item_type = 'test' AND item_id = ?
        `)
        .run(Number(evaluated.score), sub.user_id, sub.test_id);

      await db
        .prepare(`
          UPDATE exam_attempts
          SET graded = 1, score = ?, scale = ?, percent = ?, correct_count = ?, question_count = ?,
              answer_key_json = ?, result_json = ?
          WHERE user_id = ? AND document_id = ?
        `)
        .run(
          Number(evaluated.score),
          Number(evaluated.scale || 10),
          Number(evaluated.percent || 0),
          Number(evaluated.correctCount || 0),
          Number(evaluated.questionCount || 0),
          JSON.stringify({ answers: answersMap, points: pointsMap }),
          JSON.stringify(fullResult),
          sub.user_id,
          sub.test_id
        );

      await upsertLearningResult({
        recordKey: `test:${sub.test_id}:user:${sub.user_id}`,
        userId: sub.user_id,
        userName: sub.userName,
        userEmail: sub.userEmail,
        subject: sub.subject,
        grade: sub.grade,
        category: "test",
        itemId: sub.test_id,
        itemTitle: sub.title,
        attemptId: sub.id,
        completionStatus: "completed",
        gradingStatus: "graded",
        progressPercent: 100,
        score: Number(evaluated.score),
        scale: Number(evaluated.scale || 10),
        percentScore: Number(evaluated.percent || 0),
        correctCount: evaluated.correctCount,
        questionCount: evaluated.questionCount,
        durationMinutes: sub.duration_minutes,
        timeSpentSeconds: sub.time_spent_seconds,
        fullscreenExitAutoSubmit: Boolean(sub.auto_submitted_fullscreen),
        openAt: testRow.open_at,
        closeAt: testRow.close_at,
        submittedAt: sub.submitted_at,
        gradedAt: nowIso,
        gradedById: req.user.id,
        gradedByName: req.user.name,
        extraMetadata: { teacherNote }
      });

      await notifyUser(
        sub.user_id,
        "test_graded",
        `Đã có điểm: ${sub.title}`,
        `Giảng viên đã chấm bài kiểm tra "${sub.title}" của bạn. Điểm số: ${Number(evaluated.score).toFixed(
          2
        )}/${evaluated.scale || 10}.${teacherNote ? " Nhận xét: " + teacherNote : ""}`
      );

      if (saveAsTestAnswerKey) {
        await db.prepare("UPDATE tests SET has_answer_key = 1 WHERE id = ?").run(sub.test_id);
        await db
          .prepare(`
            INSERT INTO exam_solutions (
              document_id, status, progress, phase, model, generated_json, approved_json,
              solution_version, generated_at, approved_at, approved_by, updated_at
            ) VALUES (?, 'ready', 100, 'Đã duyệt, sẵn sàng chấm', 'Giảng viên chấm', ?, ?, 1, datetime('now'), datetime('now'), ?, datetime('now'))
            ON CONFLICT(document_id) DO UPDATE SET
              status = 'ready',
              progress = 100,
              phase = 'Đã duyệt, sẵn sàng chấm',
              generated_json = excluded.generated_json,
              approved_json = excluded.approved_json,
              approved_at = datetime('now'),
              approved_by = excluded.approved_by,
              updated_at = datetime('now')
          `)
          .run(
            sub.test_id,
            JSON.stringify({
              ...answerKeyPayload,
              answerCount: normalizedQuestions.filter((q) => q.answer).length,
              requiredCount: normalizedQuestions.length
            }),
            JSON.stringify(answerKeyPayload),
            req.user.id
          );

        const otherPending = await db
          .prepare(`
            SELECT ts.*, u.name AS userName, u.email AS userEmail
            FROM test_submissions ts
            JOIN users u ON u.id = ts.user_id
            WHERE ts.test_id = ? AND ts.id <> ? AND ts.grading_status = 'pending_grade'
          `)
          .all(sub.test_id, sub.id);

        for (const other of otherPending) {
          let otherAns = {};
          try {
            otherAns = JSON.parse(other.answers_json || "{}");
          } catch {}
          const otherEval = evaluateTestSubmission({
            testRow,
            submittedAnswers: otherAns,
            answerKey: { answers: answersMap, points: pointsMap },
            questionOverrides: normalizedQuestions.map((q) => ({ ...q, pointsAwarded: undefined }))
          });
          const otherFull = {
            ...otherEval,
            submissionId: other.id,
            attemptId: other.id,
            isTest: true,
            testId: other.test_id,
            title: other.title,
            subject: other.subject,
            grade: other.grade,
            gradedBy: req.user.name,
            gradedAt: nowIso,
            saved: true
          };
          await db
            .prepare(`
              UPDATE test_submissions
              SET grading_status = 'graded', graded = 1, score = ?, scale = ?, percent = ?,
                  correct_count = ?, question_count = ?, answer_key_json = ?, result_json = ?,
                  graded_at = datetime('now'), graded_by = ?
              WHERE id = ?
            `)
            .run(
              Number(otherEval.score),
              Number(otherEval.scale || 10),
              Number(otherEval.percent || 0),
              Number(otherEval.correctCount || 0),
              Number(otherEval.questionCount || 0),
              JSON.stringify({ answers: answersMap, points: pointsMap }),
              JSON.stringify(otherFull),
              req.user.id,
              other.id
            );
          await db
            .prepare(`
              UPDATE user_progress
              SET score = ?, status = 'completed', progress_percent = 100, updated_at = datetime('now')
              WHERE user_id = ? AND item_type = 'test' AND item_id = ?
            `)
            .run(Number(otherEval.score), other.user_id, other.test_id);
          await db
            .prepare(`
              UPDATE exam_attempts
              SET graded = 1, score = ?, scale = ?, percent = ?, correct_count = ?, question_count = ?,
                  answer_key_json = ?, result_json = ?
              WHERE user_id = ? AND document_id = ?
            `)
            .run(
              Number(otherEval.score),
              Number(otherEval.scale || 10),
              Number(otherEval.percent || 0),
              Number(otherEval.correctCount || 0),
              Number(otherEval.questionCount || 0),
              JSON.stringify({ answers: answersMap, points: pointsMap }),
              JSON.stringify(otherFull),
              other.user_id,
              other.test_id
            );

          await upsertLearningResult({
            recordKey: `test:${other.test_id}:user:${other.user_id}`,
            userId: other.user_id,
            userName: other.userName,
            userEmail: other.userEmail,
            subject: other.subject,
            grade: other.grade,
            category: "test",
            itemId: other.test_id,
            itemTitle: other.title,
            attemptId: other.id,
            completionStatus: "completed",
            gradingStatus: "graded",
            progressPercent: 100,
            score: Number(otherEval.score),
            scale: Number(otherEval.scale || 10),
            percentScore: Number(otherEval.percent || 0),
            correctCount: otherEval.correctCount,
            questionCount: otherEval.questionCount,
            durationMinutes: other.duration_minutes,
            timeSpentSeconds: other.time_spent_seconds,
            fullscreenExitAutoSubmit: Boolean(other.auto_submitted_fullscreen),
            openAt: testRow.open_at,
            closeAt: testRow.close_at,
            submittedAt: other.submitted_at,
            gradedAt: nowIso,
            gradedById: req.user.id,
            gradedByName: req.user.name
          });

          await notifyUser(
            other.user_id,
            "test_graded",
            `Đã có điểm: ${other.title}`,
            `Giảng viên đã chấm bài kiểm tra "${other.title}" của bạn. Điểm số: ${Number(
              otherEval.score
            ).toFixed(2)}/${otherEval.scale || 10}.`
          );
          autoGradedOthersCount++;
        }
      }
    });

    await gradeTx();

    return res.json({
      ok: true,
      submissionId: Number(sub.id),
      score: Number(evaluated.score),
      scale: Number(evaluated.scale || 10),
      percent: Number(evaluated.percent || 0),
      correctCount: evaluated.correctCount,
      questionCount: evaluated.questionCount,
      autoGradedOthersCount,
      message: `Đã chấm xong bài làm của ${sub.userName}: ${Number(evaluated.score).toFixed(2)}/${
        evaluated.scale || 10
      } điểm.${
        autoGradedOthersCount > 0 ? ` Đã tự động chấm thêm ${autoGradedOthersCount} bài nộp cùng đề.` : ""
      }`
    });
  });

  app.get("/api/admin/tests/export-sheets", requireAdmin, async (req, res) => {
    try {
      const format = String(req.query.format || "xlsx").toLowerCase() === "csv" ? "csv" : "xlsx";
      const filters = {
        subject: String(req.query.subject || "all"),
        grade: String(req.query.grade || "all"),
        testId: String(req.query.testId || "all"),
        gradingStatus: String(req.query.gradingStatus || "all")
      };
      if (isSubordinateAdmin(req)) {
        const ownedTests = await db.prepare("SELECT id FROM tests WHERE created_by = ?").all(req.user.id);
        filters.allowedTestIds = ownedTests.map((test) => String(test.id));
        filters.createdById = req.user.id;
      }
      const exported = await buildTeacherScoresSheetExport(db, filters, format);
      res.setHeader("Content-Type", exported.contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(exported.filename)}`
      );
      res.setHeader("Cache-Control", "private, no-store");
      return res.send(exported.buffer);
    } catch (error) {
      console.error("Teacher export sheets error:", error);
      return res.status(500).json({ error: error.message || "Không thể xuất bảng điểm ra Sheets." });
    }
  });

  app.get("/api/learning-results/export-sheets", requireAuth, async (req, res) => {
    try {
      const format = String(req.query.format || "xlsx").toLowerCase() === "csv" ? "csv" : "xlsx";
      const exported = await buildUserLearningResultsSheetExport(db, req.user, format);
      res.setHeader("Content-Type", exported.contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(exported.filename)}`
      );
      res.setHeader("Cache-Control", "private, no-store");
      return res.send(exported.buffer);
    } catch (error) {
      console.error("User export sheets error:", error);
      return res.status(500).json({ error: error.message || "Không thể xuất kết quả học tập ra Sheets." });
    }
  });

  app.get("/api/learning-results/subjects", async (_req, res) => {
    return res.json({ subjects: await listRegisteredSubjects() });
  });

  app.post("/api/admin/learning-results/subjects", requireSameOrigin, requireAdmin, async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const defaultScale = Number(req.body?.defaultScale) || 10;
    if (!name || name.length > 80) {
      return res.status(400).json({ error: "Tên môn học không hợp lệ." });
    }
    const created = await ensureSubjectRegistered(name, defaultScale, req.body?.metadata || {});
    return res.status(201).json({ ok: true, subject: created, subjects: await listRegisteredSubjects() });
  });

  return {
    initTestsModuleDatabase,
    seedInitialSampleTests,
    regradeTestSubmissionsForTest,
    initManualSolutionForDocument
  };
}
