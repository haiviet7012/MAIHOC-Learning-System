import express from "express";
import { randomUUID } from "node:crypto";
import { answersMatch } from "../grading/engine.js";
import {
  audit,
  classPermission,
  cleanAnswers,
  date,
  deadlineFor,
  fail,
  integer,
  membership,
  superAdmin,
  text,
  assertAttemptOwner,
  hasActiveExam,
} from "./policy.js";
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res)).catch(next);
const rows = async (db, sql, args = []) => (await db.query(sql, args)).rows;
const one = async (db, sql, args = []) => (await rows(db, sql, args))[0];
export function createPlatformRouter({
  db,
  requireAuth,
  requireSameOrigin,
  enabled = () => process.env.MAIHOC_PLATFORM_ENABLED === "1",
}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  router.use(requireAuth);
  router.get(
    "/context",
    wrap(async (req, res) => {
      if (!enabled()) return res.json({ enabled: false, schools: [] });
      const schools = superAdmin(req.user)
        ? await rows(
            db,
            "SELECT *, 'school_admin' AS role FROM schools WHERE status='active' ORDER BY name",
          )
        : await rows(
            db,
            "SELECT s.*,m.role FROM schools s JOIN school_memberships m ON m.school_id=s.id WHERE m.user_id=$1 AND m.status='active' AND s.status='active' ORDER BY s.name",
            [req.user.id],
          );
      res.json({
        enabled: true,
        schools,
        backgroundAi: process.env.MAIHOC_AI_WORKER_ENABLED === "1",
      });
    }),
  );
  router.use((req, res, next) =>
    enabled()
      ? next()
      : res.status(503).json({
          error: "Nền tảng School mới chưa được bật trên môi trường này.",
        }),
  );
  router.use((req, res, next) =>
    ["GET", "HEAD", "OPTIONS"].includes(req.method)
      ? next()
      : requireSameOrigin(req, res, next),
  );
  const school = (req, roles = []) =>
    membership(db, req.user, integer(req.params.schoolId, "Trường"), roles);
  router.post(
    "/schools",
    wrap(async (req, res) => {
      if (!superAdmin(req.user))
        fail("Chỉ quản trị nền tảng được tạo trường.", 403);
      const s = await db.transaction(async () => {
        const s = await one(
          db,
          "INSERT INTO schools(code,name) VALUES($1,$2) RETURNING *",
          [
            text(req.body.code, "Mã trường", 80),
            text(req.body.name, "Tên trường", 200),
          ],
        );
        await audit(db, req.user, s.id, "create", "school", s.id);
        return s;
      })();
      res.status(201).json(s);
    }),
  );
  router.get(
    "/schools/:schoolId/overview",
    wrap(async (req, res) => {
      const member = await school(req);
      const sid = req.params.schoolId;
      const classes =
        member.role === "school_admin"
          ? await rows(
              db,
              "SELECT c.*,y.code AS year_code FROM classes c JOIN academic_years y ON y.id=c.academic_year_id WHERE c.school_id=$1 ORDER BY y.start_date DESC,c.class_code",
              [sid],
            )
          : await rows(
              db,
              `SELECT DISTINCT c.*,y.code AS year_code FROM classes c JOIN academic_years y ON y.id=c.academic_year_id WHERE c.school_id=$1 AND (EXISTS(SELECT 1 FROM student_enrollments e WHERE e.class_id=c.id AND e.student_id=$2 AND e.status='active') OR EXISTS(SELECT 1 FROM teacher_course_assignments t WHERE t.class_id=c.id AND t.teacher_id=$2)) ORDER BY c.class_code`,
              [sid, req.user.id],
            );
      res.json({
        classes,
        terms: await rows(
          db,
          "SELECT * FROM terms WHERE school_id=$1 ORDER BY start_date DESC",
          [sid],
        ),
        courses: await rows(
          db,
          "SELECT * FROM course_offerings WHERE school_id=$1",
          [sid],
        ),
        years: await rows(
          db,
          "SELECT *,code AS name FROM academic_years WHERE school_id=$1 ORDER BY start_date DESC",
          [sid],
        ),
        memberCount:
          member.role === "school_admin"
            ? Number(
                (
                  await one(
                    db,
                    "SELECT count(*) AS n FROM school_memberships WHERE school_id=$1 AND status='active'",
                    [sid],
                  )
                ).n,
              )
            : null,
      });
    }),
  );
  router.post(
    "/schools/:schoolId/years",
    wrap(async (req, res) => {
      await school(req, ["school_admin"]);
      const start = date(req.body.startDate, "Ngày bắt đầu"),
        end = date(req.body.endDate, "Ngày kết thúc");
      if (end <= start) fail("Năm học phải kết thúc sau ngày bắt đầu.");
      const record = await db.transaction(async () => {
        const r = await one(
          db,
          "INSERT INTO academic_years(school_id,code,start_date,end_date) VALUES($1,$2,$3,$4) RETURNING *",
          [req.params.schoolId, text(req.body.code, "Năm học", 80), start, end],
        );
        await audit(
          db,
          req.user,
          req.params.schoolId,
          "create",
          "academic_year",
          r.id,
        );
        return r;
      })();
      res.status(201).json(record);
    }),
  );
  router.post(
    "/schools/:schoolId/terms",
    wrap(async (req, res) => {
      await school(req, ["school_admin"]);
      const year = await one(
        db,
        "SELECT * FROM academic_years WHERE school_id=$1 AND id=$2",
        [req.params.schoolId, integer(req.body.academicYearId, "Năm học")],
      );
      if (!year) fail("Năm học không thuộc trường.");
      const start = date(req.body.startDate, "Bắt đầu"),
        end = date(req.body.endDate, "Kết thúc");
      if (
        end <= start ||
        start < new Date(year.start_date) ||
        end > new Date(year.end_date)
      )
        fail("Học kỳ phải nằm trong năm học.");
      const result = await db.transaction(async () => {
        const term = await one(
          db,
          "INSERT INTO terms(school_id,academic_year_id,name,start_date,end_date) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [
            req.params.schoolId,
            year.id,
            text(req.body.name, "Học kỳ", 100),
            start,
            end,
          ],
        );
        await audit(
          db,
          req.user,
          req.params.schoolId,
          "create",
          "term",
          term.id,
        );
        return term;
      })();
      res.status(201).json(result);
    }),
  );
  router.post(
    "/schools/:schoolId/courses",
    wrap(async (req, res) => {
      await school(req, ["school_admin"]);
      const cls = await one(
          db,
          "SELECT * FROM classes WHERE school_id=$1 AND id=$2",
          [req.params.schoolId, integer(req.body.classId, "Lớp")],
        ),
        term = await one(
          db,
          "SELECT * FROM terms WHERE school_id=$1 AND id=$2",
          [req.params.schoolId, integer(req.body.termId, "Học kỳ")],
        );
      if (
        !cls ||
        !term ||
        String(cls.academic_year_id) !== String(term.academic_year_id)
      )
        fail("Lớp và học kỳ phải cùng năm học của trường.");
      const course = await db.transaction(async () => {
        const c = await one(
          db,
          "INSERT INTO course_offerings(school_id,class_id,subject,term_id) VALUES($1,$2,$3,$4) RETURNING *",
          [
            req.params.schoolId,
            cls.id,
            text(req.body.subject, "Môn", 100),
            term.id,
          ],
        );
        await audit(
          db,
          req.user,
          req.params.schoolId,
          "create",
          "course",
          c.id,
        );
        return c;
      })();
      res.status(201).json(course);
    }),
  );
  router.post(
    "/schools/:schoolId/classes",
    wrap(async (req, res) => {
      await school(req, ["school_admin"]);
      const record = await db.transaction(async () => {
        const r = await one(
          db,
          "INSERT INTO classes(school_id,academic_year_id,class_code,name,grade_level) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [
            req.params.schoolId,
            integer(req.body.academicYearId, "Năm học"),
            text(req.body.classCode, "Mã lớp", 80),
            text(req.body.name, "Tên lớp", 160),
            integer(req.body.gradeLevel, "Khối", 1, 12),
          ],
        );
        await audit(db, req.user, req.params.schoolId, "create", "class", r.id);
        return r;
      })();
      res.status(201).json(record);
    }),
  );
  router.post(
    "/schools/:schoolId/members",
    wrap(async (req, res) => {
      await school(req, ["school_admin"]);
      const role = text(req.body.role, "Vai trò", 30);
      if (!["student", "teacher", "school_admin"].includes(role))
        fail("Vai trò không hợp lệ.");
      const user = await one(
        db,
        "SELECT id FROM users WHERE lower(email)=lower($1)",
        [text(req.body.email, "Email", 254)],
      );
      if (!user) fail("Email chưa có tài khoản MAIHOC.");
      await db.transaction(async () => {
        await db.query(
          "INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(school_id,user_id) DO UPDATE SET role=excluded.role,status='active'",
          [req.params.schoolId, user.id, role],
        );
        await audit(
          db,
          req.user,
          req.params.schoolId,
          "set_role",
          "membership",
          user.id,
          { role },
        );
      })();
      res.json({ ok: true });
    }),
  );
  async function enroll(req, emails, classId, reason) {
    return db.transaction(async () => {
      // Serialize transfers/imports within the school; the unique index remains the final guard.
      await db.query("SELECT id FROM schools WHERE id=$1 FOR UPDATE", [
        req.params.schoolId,
      ]);
      const cls = await one(
        db,
        "SELECT * FROM classes WHERE school_id=$1 AND id=$2 AND status='active'",
        [req.params.schoolId, classId],
      );
      if (!cls) fail("Lớp không thuộc trường.", 404);
      const users = await rows(
        db,
        "SELECT id,email FROM users WHERE lower(email)=ANY($1::text[])",
        [emails.map((x) => x.toLowerCase())],
      );
      const missing = emails.filter(
        (x) => !users.some((u) => u.email.toLowerCase() === x.toLowerCase()),
      );
      if (missing.length) fail(`Chưa có tài khoản: ${missing.join(", ")}`);
      for (const user of users) {
        const member = await one(
          db,
          "SELECT role FROM school_memberships WHERE school_id=$1 AND user_id=$2",
          [req.params.schoolId, user.id],
        );
        if (member && member.role !== "student")
          fail(`Tài khoản ${user.email} không phải học sinh.`);
        await db.query(
          "INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,$2,'student') ON CONFLICT(school_id,user_id) DO UPDATE SET status='active'",
          [req.params.schoolId, user.id],
        );
        const current = await one(
          db,
          "SELECT * FROM student_enrollments WHERE school_id=$1 AND academic_year_id=$2 AND student_id=$3 AND status='active'",
          [req.params.schoolId, cls.academic_year_id, user.id],
        );
        if (String(current?.class_id) === String(classId)) continue;
        await db.query(
          "UPDATE student_enrollments SET status='ended',ended_at=now() WHERE school_id=$1 AND academic_year_id=$2 AND student_id=$3 AND status='active'",
          [req.params.schoolId, cls.academic_year_id, user.id],
        );
        await db.query(
          "INSERT INTO student_enrollments(school_id,academic_year_id,class_id,student_id,reason,approved_by) VALUES($1,$2,$3,$4,$5,$6)",
          [
            req.params.schoolId,
            cls.academic_year_id,
            classId,
            user.id,
            reason,
            req.user.id,
          ],
        );
        await audit(
          db,
          req.user,
          req.params.schoolId,
          current ? "transfer" : "enroll",
          "student",
          user.id,
          { from: current?.class_id || null, to: classId, reason },
        );
      }
      return { ok: true, count: users.length };
    })();
  }
  router.post(
    "/schools/:schoolId/enrollments",
    wrap(async (req, res) => {
      await school(req, ["school_admin"]);
      res.json(
        await enroll(
          req,
          [text(req.body.email, "Email", 254)],
          integer(req.body.classId, "Lớp"),
          text(req.body.reason, "Lý do", 1000),
        ),
      );
    }),
  );
  router.post(
    "/schools/:schoolId/import",
    wrap(async (req, res) => {
      await school(req, ["school_admin"]);
      const emails = req.body.emails;
      if (!Array.isArray(emails) || !emails.length || emails.length > 200)
        fail("Danh sách cần từ 1 đến 200 email.");
      const normalized = emails.map((x) => text(x, "Email", 254).toLowerCase());
      if (new Set(normalized).size !== normalized.length)
        fail("Danh sách có email trùng.");
      res.json(
        await enroll(
          req,
          normalized,
          integer(req.body.classId, "Lớp"),
          "Import danh sách đã kiểm tra",
        ),
      );
    }),
  );
  router.post(
    "/schools/:schoolId/teachers",
    wrap(async (req, res) => {
      await school(req, ["school_admin"]);
      const teacher = await one(
        db,
        "SELECT u.id FROM users u JOIN school_memberships m ON m.user_id=u.id WHERE m.school_id=$1 AND m.role='teacher' AND m.status='active' AND lower(u.email)=lower($2)",
        [req.params.schoolId, text(req.body.email, "Email", 254)],
      );
      if (!teacher) fail("Giáo viên chưa có membership trong trường.");
      const kind = text(req.body.kind, "Phân công", 20);
      if (!["subject", "homeroom"].includes(kind))
        fail("Phân công không hợp lệ.");
      const subject = text(req.body.subject, "Môn học", 100);
      await db.transaction(async () => {
        await db.query(
          "INSERT INTO teacher_course_assignments(school_id,class_id,teacher_id,subject,kind) VALUES($1,$2,$3,$4,$5) ON CONFLICT(school_id,class_id,teacher_id,subject,kind) DO NOTHING",
          [
            req.params.schoolId,
            integer(req.body.classId, "Lớp"),
            teacher.id,
            subject,
            kind,
          ],
        );
        await audit(
          db,
          req.user,
          req.params.schoolId,
          "assign",
          "teacher",
          teacher.id,
          { classId: req.body.classId, subject, kind },
        );
      })();
      res.json({ ok: true });
    }),
  );
  router.get(
    "/schools/:schoolId/curriculum",
    wrap(async (req, res) => {
      await school(req);
      res.json({
        nodes: await rows(
          db,
          "SELECT n.*,v.name AS version FROM curriculum_nodes n JOIN curriculum_versions v ON v.id=n.curriculum_version_id WHERE n.school_id=$1 ORDER BY n.subject,n.grade,n.name",
          [req.params.schoolId],
        ),
      });
    }),
  );
  router.post(
    "/schools/:schoolId/curriculum",
    wrap(async (req, res) => {
      await school(req, ["school_admin", "teacher"]);
      const result = await db.transaction(async () => {
        const version = await one(
          db,
          "INSERT INTO curriculum_versions(school_id,name) VALUES($1,$2) ON CONFLICT(school_id,name) DO UPDATE SET name=excluded.name RETURNING id",
          [req.params.schoolId, text(req.body.version, "Phiên bản", 160)],
        );
        const node = await one(
          db,
          "INSERT INTO curriculum_nodes(school_id,curriculum_version_id,subject,grade,name) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [
            req.params.schoolId,
            version.id,
            text(req.body.subject, "Môn", 100),
            integer(req.body.grade, "Khối", 1, 12),
            text(req.body.name, "Chuyên đề", 250),
          ],
        );
        await audit(
          db,
          req.user,
          req.params.schoolId,
          "create",
          "curriculum_node",
          node.id,
        );
        return node;
      })();
      res.status(201).json(result);
    }),
  );
  router.get(
    "/schools/:schoolId/questions",
    wrap(async (req, res) => {
      const member = await school(req, ["school_admin", "teacher"]);
      const items = await rows(
        db,
        `SELECT q.*,n.name AS topic_name FROM question_versions q JOIN curriculum_nodes n ON n.id=q.curriculum_node_id WHERE q.school_id=$1 ORDER BY q.id DESC LIMIT 500`,
        [req.params.schoolId],
      );
      res.json({ items });
    }),
  );
  router.post(
    "/schools/:schoolId/questions",
    wrap(async (req, res) => {
      await school(req, ["school_admin", "teacher"]);
      const type = text(req.body.type, "Loại câu", 30);
      if (
        !["multiple_choice", "true_false", "short_answer", "essay"].includes(
          type,
        )
      )
        fail("Loại câu chưa hỗ trợ.");
      const choices = req.body.choices || [];
      if (!Array.isArray(choices) || choices.length > 10)
        fail("Lựa chọn không hợp lệ.");
      const answer = text(req.body.answer, "Đáp án hoặc rubric", 12000);
      if (
        type === "multiple_choice" &&
        (choices.length < 2 ||
          !/^\d+$/.test(answer) ||
          Number(answer) >= choices.length)
      )
        fail(
          "Đáp án trắc nghiệm dùng vị trí từ 0 (lựa chọn đầu tiên), phải thuộc danh sách.",
        );
      if (type === "true_false") {
        let key;
        try {
          key = JSON.parse(answer);
        } catch {}
        if (
          choices.length !== 4 ||
          !Array.isArray(key) ||
          key.length !== 4 ||
          key.some((x) => typeof x !== "boolean")
        )
          fail(
            "Đúng/sai cần 4 mệnh đề và đáp án dạng [true,false,true,false].",
          );
      }
      const result = await db.transaction(async () => {
        const node = await one(
          db,
          "SELECT * FROM curriculum_nodes WHERE school_id=$1 AND id=$2",
          [
            req.params.schoolId,
            integer(req.body.curriculumNodeId, "Chuyên đề"),
          ],
        );
        const subject = text(req.body.subject, "Môn", 100),
          grade = integer(req.body.grade, "Khối", 1, 12);
        if (!node || node.subject !== subject || Number(node.grade) !== grade)
          fail("Chuyên đề phải khớp trường, môn và khối.");
        let item,
          version = 1;
        if (req.body.previousVersionId) {
          const previous = await one(
            db,
            "SELECT * FROM question_versions WHERE school_id=$1 AND id=$2",
            [
              req.params.schoolId,
              integer(req.body.previousVersionId, "Phiên bản trước"),
            ],
          );
          if (!previous) fail("Phiên bản trước không thuộc trường.", 404);
          item = await one(
            db,
            "SELECT id FROM question_items WHERE school_id=$1 AND id=$2 FOR UPDATE",
            [req.params.schoolId, previous.question_item_id],
          );
          version =
            Number(
              (
                await one(
                  db,
                  "SELECT max(version) AS n FROM question_versions WHERE question_item_id=$1",
                  [item.id],
                )
              ).n,
            ) + 1;
        } else
          item = await one(
            db,
            "INSERT INTO question_items(school_id,created_by) VALUES($1,$2) RETURNING id",
            [req.params.schoolId, req.user.id],
          );
        const q = await one(
          db,
          "INSERT INTO question_versions(school_id,question_item_id,version,subject,grade,curriculum_node_id,type,stem,choices,answer,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
          [
            req.params.schoolId,
            item.id,
            version,
            subject,
            grade,
            node.id,
            type,
            text(req.body.stem, "Nội dung", 12000),
            JSON.stringify(choices.map((x) => text(x, "Lựa chọn", 2000))),
            answer,
            text(req.body.source, "Nguồn", 1000),
          ],
        );
        await audit(
          db,
          req.user,
          req.params.schoolId,
          "create",
          "question_version",
          q.id,
        );
        return q;
      })();
      res.status(201).json(result);
    }),
  );
  router.post(
    "/schools/:schoolId/questions/:questionId/approve",
    wrap(async (req, res) => {
      await school(req, ["school_admin", "teacher"]);
      await db.transaction(async () => {
        const q = await one(
          db,
          "UPDATE question_versions SET status='approved',reviewed_by=$3,reviewed_at=now() WHERE school_id=$1 AND id=$2 AND status='draft' RETURNING id",
          [
            req.params.schoolId,
            integer(req.params.questionId, "Câu hỏi"),
            req.user.id,
          ],
        );
        if (!q) fail("Không có câu hỏi nháp này.", 404);
        await audit(
          db,
          req.user,
          req.params.schoolId,
          "approve",
          "question_version",
          q.id,
        );
      })();
      res.json({ ok: true });
    }),
  );
  router.get(
    "/schools/:schoolId/assignments",
    wrap(async (req, res) => {
      const member = await school(req);
      const items = await rows(
        db,
        `SELECT a.*,s.title,s.subject,c.name AS class_name FROM assessment_assignments a JOIN assessments s ON s.id=a.assessment_id JOIN classes c ON c.id=a.class_id WHERE a.school_id=$1 AND (a.student_id IS NULL OR a.student_id=$2 OR $4::boolean) AND ($3::boolean OR EXISTS(SELECT 1 FROM teacher_course_assignments t WHERE t.school_id=a.school_id AND t.class_id=a.class_id AND t.teacher_id=$2 AND (t.subject=s.subject OR t.kind='homeroom')) OR EXISTS(SELECT 1 FROM student_enrollments e WHERE e.school_id=a.school_id AND e.class_id=a.class_id AND e.student_id=$2 AND e.status='active')) ORDER BY a.open_at DESC`,
        [
          req.params.schoolId,
          req.user.id,
          member.role === "school_admin",
          member.role !== "student",
        ],
      );
      res.json({ items });
    }),
  );
  router.post(
    "/schools/:schoolId/assignments",
    wrap(async (req, res) => {
      await school(req, ["school_admin", "teacher"]);
      const sid = req.params.schoolId,
        cls = integer(req.body.classId, "Lớp"),
        ids = req.body.questionIds;
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.length > 100 ||
        new Set(ids.map(String)).size !== ids.length
      )
        fail("Chọn từ 1 đến 100 câu hỏi khác nhau.");
      const open = date(req.body.openAt, "Mở bài"),
        close = date(req.body.closeAt, "Đóng bài");
      if (close <= open) fail("Thời gian đóng phải sau thời gian mở.");
      const duration = integer(req.body.durationMinutes, "Thời lượng", 1, 240);
      const result = await db.transaction(async () => {
        const questions = await rows(
          db,
          "SELECT * FROM question_versions WHERE school_id=$1 AND id=ANY($2::bigint[]) AND status='approved'",
          [sid, ids.map((x) => integer(x, "Câu hỏi"))],
        );
        if (questions.length !== ids.length)
          fail("Có câu hỏi chưa duyệt hoặc không thuộc trường.");
        const subject = questions[0].subject;
        if (
          questions.some(
            (q) => q.subject !== subject || q.grade !== questions[0].grade,
          )
        )
          fail("Đề cần cùng môn và khối.");
        await classPermission(db, req.user, sid, cls, { teach: true, subject });
        const target = await one(
          db,
          "SELECT grade_level FROM classes WHERE school_id=$1 AND id=$2",
          [sid, cls],
        );
        if (
          !target ||
          Number(target.grade_level) !== Number(questions[0].grade)
        )
          fail("Khối của lớp không khớp đề.");
        const assessment = await one(
          db,
          "INSERT INTO assessments(school_id,title,created_by,subject) VALUES($1,$2,$3,$4) RETURNING id",
          [sid, text(req.body.title, "Tên bài", 250), req.user.id, subject],
        );
        for (let i = 0; i < ids.length; i++) {
          const points = Number(req.body.points?.[ids[i]] ?? 1);
          if (!Number.isFinite(points) || points <= 0 || points > 100)
            fail("Điểm mỗi câu phải lớn hơn 0 và không quá 100.");
          const q = questions.find((q) => String(q.id) === String(ids[i]));
          await db.query(
            "INSERT INTO assessment_items(school_id,assessment_id,question_version_id,position,points,snapshot) VALUES($1,$2,$3,$4,$5,$6)",
            [
              sid,
              assessment.id,
              q.id,
              i,
              points,
              JSON.stringify({
                stem: q.stem,
                type: q.type,
                choices: q.choices,
                answer: q.answer,
                curriculumNodeId: q.curriculum_node_id,
              }),
            ],
          );
        }
        const assignment = await one(
          db,
          "INSERT INTO assessment_assignments(school_id,assessment_id,class_id,open_at,close_at,duration_minutes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [sid, assessment.id, cls, open, close, duration],
        );
        await audit(db, req.user, sid, "publish", "assignment", assignment.id, {
          assessmentId: assessment.id,
        });
        return assignment;
      })();
      res.status(201).json(result);
    }),
  );
  async function assignmentFor(id) {
    const a = await one(
      db,
      "SELECT a.*,s.title,s.subject FROM assessment_assignments a JOIN assessments s ON s.id=a.assessment_id WHERE a.id=$1",
      [integer(id, "Bài được giao")],
    );
    if (!a) fail("Không có bài được giao này.", 404);
    return a;
  }
  async function attemptFor(id, user, lock = false) {
    const a = await one(
      db,
      `SELECT * FROM assessment_attempts WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [integer(id, "Lượt làm")],
    );
    if (!a) fail("Không có lượt làm này.", 404);
    assertAttemptOwner(a, user);
    await membership(db, user, a.school_id, ["student"]);
    return a;
  }
  router.post(
    "/schools/:schoolId/practice",
    wrap(async (req, res) => {
      await school(req, ["student"]);
      const sid = req.params.schoolId,
        topicId = integer(req.body.topicId, "Chuyên đề");
      const result = await db.transaction(async () => {
        const node = await one(
          db,
          "SELECT * FROM curriculum_nodes WHERE school_id=$1 AND id=$2",
          [sid, topicId],
        );
        if (!node) fail("Chuyên đề không thuộc trường.", 404);
        const enrollment = await one(
          db,
          "SELECT e.* FROM student_enrollments e JOIN classes c ON c.id=e.class_id WHERE e.school_id=$1 AND e.student_id=$2 AND e.status='active' AND c.grade_level=$3 ORDER BY e.started_at DESC LIMIT 1",
          [sid, req.user.id, node.grade],
        );
        if (!enrollment)
          fail("Bạn cần được ghi danh vào lớp cùng khối để luyện chuyên đề.");
        const questions = await rows(
          db,
          "SELECT q.* FROM question_versions q WHERE q.school_id=$1 AND q.curriculum_node_id=$2 AND q.status='approved' AND q.type<>'essay' ORDER BY q.id LIMIT 10",
          [sid, node.id],
        );
        if (!questions.length)
          fail("Chưa có câu hỏi được duyệt cho chuyên đề này.");
        const assessment = await one(
          db,
          "INSERT INTO assessments(school_id,title,created_by,subject) VALUES($1,$2,$3,$4) RETURNING id",
          [sid, `Luyện tập ${node.name}`, req.user.id, node.subject],
        );
        for (let index = 0; index < questions.length; index++) {
          const q = questions[index];
          await db.query(
            "INSERT INTO assessment_items(school_id,assessment_id,question_version_id,position,snapshot) VALUES($1,$2,$3,$4,$5)",
            [
              sid,
              assessment.id,
              q.id,
              index,
              JSON.stringify({
                stem: q.stem,
                type: q.type,
                choices: q.choices,
                answer: q.answer,
                curriculumNodeId: node.id,
              }),
            ],
          );
        }
        const a = await one(
          db,
          "INSERT INTO assessment_assignments(school_id,assessment_id,class_id,open_at,close_at,duration_minutes,student_id,is_practice) VALUES($1,$2,$3,now(),now()+interval '1 day',20,$4,true) RETURNING id",
          [sid, assessment.id, enrollment.class_id, req.user.id],
        );
        await audit(db, req.user, sid, "practice", "assignment", a.id, {
          topicId,
        });
        return a;
      })();
      res.status(201).json(result);
    }),
  );
  router.post(
    "/assignments/:assignmentId/start",
    wrap(async (req, res) => {
      const a = await assignmentFor(req.params.assignmentId);
      if (a.student_id && String(a.student_id) !== String(req.user.id))
        fail("Bài luyện được giao riêng cho học sinh khác.", 403);
      await membership(db, req.user, a.school_id, ["student"]);
      await classPermission(db, req.user, a.school_id, a.class_id);
      const now = new Date();
      if (now < new Date(a.open_at) || now > new Date(a.close_at))
        fail("Bài chưa mở hoặc đã hết hạn.", 403);
      const attempt = await db.transaction(async () => {
        await db.query(
          "INSERT INTO assessment_attempts(school_id,assignment_id,assessment_id,student_id,started_at,deadline_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(assignment_id,student_id) DO NOTHING",
          [
            a.school_id,
            a.id,
            a.assessment_id,
            req.user.id,
            now,
            deadlineFor(now, a.close_at, a.duration_minutes),
          ],
        );
        return one(
          db,
          "SELECT * FROM assessment_attempts WHERE assignment_id=$1 AND student_id=$2",
          [a.id, req.user.id],
        );
      })();
      const items = await rows(
        db,
        "SELECT id,snapshot FROM assessment_items WHERE assessment_id=$1 ORDER BY position",
        [a.assessment_id],
      );
      res.json({
        title: a.title,
        attempt,
        items: items.map(({ id, snapshot }) => ({
          id,
          stem: snapshot.stem,
          type: snapshot.type,
          choices: snapshot.choices,
        })),
      });
    }),
  );
  router.patch(
    "/attempts/:attemptId",
    wrap(async (req, res) => {
      const answers = cleanAnswers(req.body.answers),
        version = integer(req.body.version, "Phiên bản", 0);
      const result = await db.transaction(async () => {
        const a = await attemptFor(req.params.attemptId, req.user, true);
        if (a.status !== "in_progress" || new Date() > new Date(a.deadline_at))
          fail("Lượt làm đã đóng.", 409);
        if (a.version !== version)
          fail("Bài đã được cập nhật ở nơi khác. Mở lại để đồng bộ.", 409);
        return one(
          db,
          "UPDATE assessment_attempts SET answers=$2,version=version+1 WHERE id=$1 RETURNING version",
          [a.id, JSON.stringify(answers)],
        );
      })();
      res.json(result);
    }),
  );
  router.post(
    "/attempts/:attemptId/submit",
    wrap(async (req, res) => {
      const answers = cleanAnswers(req.body.answers),
        key = text(req.body.idempotencyKey, "Khóa nộp bài", 160);
      const result = await db.transaction(async () => {
        const a = await attemptFor(req.params.attemptId, req.user, true);
        if (a.status !== "in_progress") {
          if (a.idempotency_key !== key)
            fail("Lượt làm đã nộp bằng yêu cầu khác.", 409);
          const result = await one(
            db,
            "SELECT * FROM assessment_results WHERE attempt_id=$1",
            [a.id],
          );
          return {
            ...result,
            score: result.score == null ? null : Number(result.score),
            scale: Number(result.scale),
            status: a.status,
          };
        }
        // After a deadline, only the last server-acknowledged draft can be submitted.
        const finalAnswers =
          new Date() > new Date(a.deadline_at) ? a.answers : answers;
        const items = await rows(
          db,
          "SELECT * FROM assessment_items WHERE assessment_id=$1 ORDER BY position",
          [a.assessment_id],
        );
        let earned = 0,
          total = 0,
          manual = false;
        for (const item of items) {
          const snapshot = item.snapshot;
          const answer =
            snapshot.type === "true_false"
              ? JSON.stringify(
                  [0, 1, 2, 3].map((j) =>
                    String(finalAnswers[`${item.id}_${j}`] ?? ""),
                  ),
                )
              : String(finalAnswers[item.id] ?? "");
          let correct =
              snapshot.type === "essay"
                ? null
                : answersMatch(snapshot.answer, answer),
            points =
              correct === null ? null : correct ? Number(item.points) : 0;
          if (snapshot.type === "true_false") {
            const expected = JSON.parse(snapshot.answer),
              submitted = JSON.parse(answer),
              count = expected.filter(
                (value, index) => String(value) === submitted[index],
              ).length;
            correct = count === 4;
            points = [0, 0.1, 0.25, 0.5, 1][count] * Number(item.points);
          }
          manual ||= correct === null;
          earned += points || 0;
          total += Number(item.points);
          await db.query(
            "INSERT INTO attempt_answers(assessment_id,attempt_id,assessment_item_id,answer,correct,points) VALUES($1,$2,$3,$4,$5,$6)",
            [a.assessment_id, a.id, item.id, answer, correct, points],
          );
        }
        const status = manual ? "pending_grade" : "graded",
          score = manual ? null : Math.round((earned / total) * 1000) / 100;
        await db.query(
          "UPDATE assessment_attempts SET status=$2,answers=$3,submitted_at=now(),idempotency_key=$4,version=version+1 WHERE id=$1",
          [a.id, status, JSON.stringify(finalAnswers), key],
        );
        await db.query(
          "INSERT INTO assessment_results(attempt_id,score,graded_at) VALUES($1,$2,$3)",
          [a.id, score, manual ? null : new Date()],
        );
        await audit(db, req.user, a.school_id, "submit", "attempt", a.id, {
          status,
        });
        return { score, scale: 10, status };
      })();
      res.json(result);
    }),
  );
  router.get(
    "/schools/:schoolId/assignments/:assignmentId/results",
    wrap(async (req, res) => {
      await school(req, ["school_admin", "teacher"]);
      const a = await assignmentFor(req.params.assignmentId);
      if (String(a.school_id) !== String(req.params.schoolId))
        fail("Không có bài này trong trường.", 404);
      await classPermission(db, req.user, a.school_id, a.class_id, {
        teach: true,
        subject: a.subject,
      });
      res.json({
        items: await rows(
          db,
          "SELECT a.id,a.status,a.submitted_at,u.name AS student_name,r.score,r.scale FROM assessment_attempts a JOIN users u ON u.id=a.student_id LEFT JOIN assessment_results r ON r.attempt_id=a.id WHERE a.assignment_id=$1 ORDER BY u.name",
          [a.id],
        ),
      });
    }),
  );
  router.get(
    "/schools/:schoolId/assignments/:assignmentId/export",
    wrap(async (req, res) => {
      await school(req, ["school_admin", "teacher"]);
      const a = await assignmentFor(req.params.assignmentId);
      if (String(a.school_id) !== String(req.params.schoolId))
        fail("Không có bài này trong trường.", 404);
      await classPermission(db, req.user, a.school_id, a.class_id, {
        teach: true,
        subject: a.subject,
      });
      const results = await rows(
        db,
        "SELECT u.name,u.email,a.status,r.score,r.scale,a.submitted_at FROM assessment_attempts a JOIN users u ON u.id=a.student_id LEFT JOIN assessment_results r ON r.attempt_id=a.id WHERE a.assignment_id=$1 ORDER BY u.name",
        [a.id],
      );
      const csv = (value) =>
        '"' +
        String(value ?? "")
          .replace(/^[=+@-]/, "'$&")
          .replaceAll('"', '""') +
        '"';
      const lines = [
        ["Họ tên", "Email", "Trạng thái", "Điểm", "Thang điểm", "Nộp lúc"],
        ...results.map((r) => [
          r.name,
          r.email,
          r.status,
          r.score,
          r.scale,
          r.submitted_at,
        ]),
      ];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="assignment-${a.id}.csv"`,
      );
      res.setHeader("Cache-Control", "private, no-store");
      res.send(
        "\uFEFF" + lines.map((line) => line.map(csv).join(",")).join("\r\n"),
      );
    }),
  );
  router.post(
    "/schools/:schoolId/attempts/:attemptId/grade",
    wrap(async (req, res) => {
      await school(req, ["school_admin", "teacher"]);
      const score = Number(req.body.score);
      if (!Number.isFinite(score) || score < 0 || score > 10)
        fail("Điểm phải từ 0 đến 10.");
      const feedback = text(req.body.feedback, "Nhận xét", 5000);
      await db.transaction(async () => {
        const attempt = await one(
          db,
          "SELECT * FROM assessment_attempts WHERE school_id=$1 AND id=$2 FOR UPDATE",
          [req.params.schoolId, integer(req.params.attemptId, "Lượt làm")],
        );
        if (!attempt || attempt.status === "in_progress")
          fail("Bài chưa nộp hoặc không thuộc trường.");
        const a = await assignmentFor(attempt.assignment_id);
        await classPermission(db, req.user, a.school_id, a.class_id, {
          teach: true,
          subject: a.subject,
        });
        const before = await one(
          db,
          "SELECT score,feedback FROM assessment_results WHERE attempt_id=$1",
          [attempt.id],
        );
        await db.query(
          "UPDATE assessment_results SET score=$2,feedback=$3,grading_version=grading_version+1,graded_by=$4,graded_at=now() WHERE attempt_id=$1",
          [attempt.id, score, feedback, req.user.id],
        );
        await db.query(
          "UPDATE assessment_attempts SET status='graded' WHERE id=$1",
          [attempt.id],
        );
        await audit(db, req.user, a.school_id, "grade", "attempt", attempt.id, {
          before,
          after: { score, feedback },
        });
      })();
      res.json({ ok: true });
    }),
  );
  router.get(
    "/schools/:schoolId/analytics",
    wrap(async (req, res) => {
      const member = await school(req);
      const topics = await rows(
        db,
        `SELECT n.id,n.name,count(*) AS observations,count(*) FILTER(WHERE aa.correct) AS correct FROM attempt_answers aa JOIN assessment_attempts a ON a.id=aa.attempt_id JOIN assessment_assignments assignment ON assignment.id=a.assignment_id JOIN assessment_items i ON i.id=aa.assessment_item_id JOIN question_versions q ON q.id=i.question_version_id JOIN curriculum_nodes n ON n.id=q.curriculum_node_id WHERE a.school_id=$1 AND aa.correct IS NOT NULL AND ($3::boolean OR (a.student_id=$2 AND $4='student') OR ($4='teacher' AND EXISTS(SELECT 1 FROM teacher_course_assignments t WHERE t.school_id=a.school_id AND t.class_id=assignment.class_id AND t.teacher_id=$2 AND (t.subject=q.subject OR t.kind='homeroom')))) GROUP BY n.id,n.name ORDER BY n.name`,
        [
          req.params.schoolId,
          req.user.id,
          member.role === "school_admin",
          member.role,
        ],
      );
      res.json({ topics });
    }),
  );
  router.post(
    "/ai/jobs",
    wrap(async (req, res) => {
      if (process.env.MAIHOC_AI_WORKER_ENABLED !== "1")
        fail("Worker AI nền chưa được bật trên môi trường này.", 503);
      if (await hasActiveExam(db, req.user.id))
        fail("Gia sư AI tạm dừng khi bạn đang làm bài kiểm tra.", 403);
      const mode = text(req.body.mode || "hint", "Chế độ", 20);
      if (!["hint", "check", "detailed"].includes(mode))
        fail("Chế độ không hợp lệ.");
      const payload = {
        prompt: text(req.body.prompt, "Câu hỏi", 12000),
        subject: req.body.subject || "Tự nhận diện",
        mode,
      };
      const job = await db.transaction(async () => {
        await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          req.user.id,
        ]);
        const pending = await one(
          db,
          "SELECT count(*) AS n FROM platform_jobs WHERE user_id=$1 AND created_at>now()-interval '1 hour'",
          [req.user.id],
        );
        if (Number(pending.n) >= 20)
          fail("Đã đạt giới hạn 20 yêu cầu mỗi giờ.", 429);
        return one(
          db,
          "INSERT INTO platform_jobs(id,user_id,kind,payload) VALUES($1,$2,$3,$4) RETURNING id,status",
          [randomUUID(), req.user.id, "ai_tutor", JSON.stringify(payload)],
        );
      })();
      res.status(202).json(job);
    }),
  );
  router.get(
    "/ai/jobs/:jobId",
    wrap(async (req, res) => {
      const job = await one(
        db,
        "SELECT id,status,result,error FROM platform_jobs WHERE id=$1 AND user_id=$2",
        [req.params.jobId, req.user.id],
      );
      if (!job) fail("Không có tác vụ này.", 404);
      res.json(job);
    }),
  );
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error.status ||
      (["23503", "23505", "23514", "22P02"].includes(error.pgCode || error.code)
        ? 400
        : 500);
    if (status === 500) console.error("[Platform]", error.message);
    res.status(status).json({
      error:
        status === 500
          ? "Không thể xử lý yêu cầu. Vui lòng thử lại sau."
          : error.status
            ? error.message
            : "Dữ liệu trùng hoặc không thuộc phạm vi trường/năm học hợp lệ.",
    });
  });
  return router;
}
