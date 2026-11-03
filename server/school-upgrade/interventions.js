import { randomUUID } from "node:crypto";
import { classEvidence } from "../learning-advisor/evidence.js";
import {
  integer,
  text,
  fail,
  classPermission,
  audit,
} from "../platform/policy.js";
import { upgradeAccess, uuid } from "./policy.js";
import { wrap } from "./documents.js";
export function installInterventions(router, { db }) {
  const context = async (req) => {
    const sid = integer(req.params.schoolId, "Trường"),
      classId = integer(req.query.classId || req.body.classId, "Lớp"),
      subject = text(req.query.subject || req.body.subject, "Môn học", 100);
    const member = await upgradeAccess(db, req.user, sid);
    await classPermission(db, req.user, sid, classId, { subject });
    return { sid, classId, subject, staff: member.role !== "student" };
  };
  router.get(
    "/schools/:schoolId/evidence",
    wrap(async (req, res) => {
      const c = await context(req);
      res.json({
        ...(await classEvidence(
          db,
          req.user,
          c.sid,
          c.classId,
          c.subject,
          c.staff,
        )),
        staff: c.staff,
      });
    }),
  );
  router.post(
    "/schools/:schoolId/interventions",
    wrap(async (req, res) => {
      const c = await context(req);
      if (!c.staff) fail("Chỉ giáo viên được đề xuất nhóm phụ đạo.", 403);
      const topicId = integer(req.body.topicId, "Chuyên đề");
      const evidence = await classEvidence(
        db,
        req.user,
        c.sid,
        c.classId,
        c.subject,
        true,
      );
      const weak = evidence.groups.filter(
        (g) =>
          String(g.topicId) === String(topicId) &&
          g.dataLevel !== "insufficient" &&
          g.errorRate >= 40,
      );
      if (!weak.length)
        fail("Chưa đủ bằng chứng để đề xuất nhóm cho chuyên đề này.", 422);
      let ids = weak.map((g) => Number(g.studentId));
      if (req.body.studentIds !== undefined) {
        if (!Array.isArray(req.body.studentIds))
          fail("Danh sách học sinh không hợp lệ.");
        ids = req.body.studentIds.map((x) => integer(x, "Học sinh"));
        if (
          !ids.length ||
          ids.some((id) => !weak.some((g) => Number(g.studentId) === id))
        )
          fail("Chỉ chọn học sinh có bằng chứng phù hợp trong lớp.");
      }
      const questions = (
        await db.query(
          `SELECT id FROM question_versions WHERE school_id=$1 AND curriculum_node_id=$2 AND subject=$3 AND status='approved' AND type IN ('multiple_choice','short_answer') ORDER BY id DESC LIMIT 5`,
          [c.sid, topicId, c.subject],
        )
      ).rows.map((q) => Number(q.id));
      if (!questions.length)
        fail("Cần có câu hỏi bổ trợ đã duyệt cho chuyên đề này.", 422);
      const id = randomUUID();
      await db.query(
        `INSERT INTO school_interventions(id,school_id,class_id,teacher_id,topic_id,student_ids,question_ids,title) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          c.sid,
          c.classId,
          req.user.id,
          topicId,
          JSON.stringify([...new Set(ids)]),
          JSON.stringify(questions),
          text(req.body.title || `Bổ trợ ${weak[0].topic}`, "Tên bài", 200),
        ],
      );
      res
        .status(201)
        .json({ id, studentIds: ids, questionIds: questions, status: "draft" });
    }),
  );
  router.get(
    "/schools/:schoolId/interventions",
    wrap(async (req, res) => {
      const c = await context(req);
      if (!c.staff) fail("Chức năng dành cho giáo viên.", 403);
      res.json({
        drafts: (
          await db.query(
            "SELECT * FROM school_interventions WHERE school_id=$1 AND class_id=$2 AND teacher_id=$3 ORDER BY created_at DESC LIMIT 50",
            [c.sid, c.classId, req.user.id],
          )
        ).rows,
      });
    }),
  );
  router.post(
    "/schools/:schoolId/interventions/:id/approve",
    wrap(async (req, res) => {
      const c = await context(req);
      if (!c.staff) fail("Chỉ giáo viên được duyệt.", 403);
      const result = await db.transaction(async () => {
        const draft = (
          await db.query(
            "SELECT * FROM school_interventions WHERE id=$1 AND school_id=$2 AND class_id=$3 AND teacher_id=$4 FOR UPDATE",
            [uuid(req.params.id), c.sid, c.classId, req.user.id],
          )
        ).rows[0];
        if (!draft) fail("Không tìm thấy bản nháp phụ đạo.", 404);
        if (draft.status === "assigned") return draft;
        const enrolled = (
          await db.query(
            "SELECT student_id FROM student_enrollments WHERE school_id=$1 AND class_id=$2 AND status='active'",
            [c.sid, c.classId],
          )
        ).rows.map((x) => Number(x.student_id));
        if (draft.student_ids.some((x) => !enrolled.includes(Number(x))))
          fail("Danh sách lớp đã thay đổi. Tạo lại bản nháp.", 409);
        const qs = (
          await db.query(
            `SELECT * FROM question_versions WHERE school_id=$1 AND id=ANY($2::bigint[]) AND curriculum_node_id=$3 AND subject=$4 AND status='approved'`,
            [c.sid, draft.question_ids, draft.topic_id, c.subject],
          )
        ).rows;
        if (qs.length !== draft.question_ids.length)
          fail("Câu hỏi đã thay đổi trạng thái hoặc khác môn.", 409);
        const assessment = (
          await db.query(
            "INSERT INTO assessments(school_id,title,created_by,subject) VALUES($1,$2,$3,$4) RETURNING id",
            [c.sid, draft.title, req.user.id, c.subject],
          )
        ).rows[0];
        for (let i = 0; i < qs.length; i++) {
          const q = qs[i];
          await db.query(
            "INSERT INTO assessment_items(school_id,assessment_id,question_version_id,position,snapshot) VALUES($1,$2,$3,$4,$5)",
            [
              c.sid,
              assessment.id,
              q.id,
              i,
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
        const assignments = [];
        for (const id of draft.student_ids) {
          const a = (
            await db.query(
              `INSERT INTO assessment_assignments(school_id,assessment_id,class_id,open_at,close_at,duration_minutes,student_id,is_practice) VALUES($1,$2,$3,now(),now()+interval '7 days',20,$4,true) RETURNING id`,
              [c.sid, assessment.id, c.classId, id],
            )
          ).rows[0];
          assignments.push(a.id);
        }
        await audit(
          db,
          req.user,
          c.sid,
          "approve_and_assign",
          "school_intervention",
          draft.id,
          { assignmentIds: assignments },
        );
        return (
          await db.query(
            "UPDATE school_interventions SET status='assigned',assignment_ids=$2,approved_at=now() WHERE id=$1 RETURNING *",
            [draft.id, JSON.stringify(assignments)],
          )
        ).rows[0];
      })();
      res.json(result);
    }),
  );
}
