import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { testDatabase } from "./test-db.js";
import { createPlatformRouter } from "./routes.js";
import { installLegacySessions } from "./legacy.js";
import { installStudyRooms } from "../study-rooms/server.js";
import { migrate } from "./migrate.js";
import { workOnce } from "./worker.js";
import { cleanAnswers, deadlineFor } from "./policy.js";
import { geminiModels, tutorInstruction } from "../ai-models.js";
import { parseRoute, routeUrl } from "../../js/platform/router.js";

test("School/Learning PostgreSQL integration and legacy compatibility", async (t) => {
  const fixture = await testDatabase(),
    db = fixture.db;
  const users = {
    1: { id: 1, role: "admin", adminLevel: 2, name: "Admin" },
    2: { id: 2, role: "user", name: "Student A" },
    3: { id: 3, role: "admin", adminLevel: 1, name: "Teacher A" },
    4: { id: 4, role: "user", name: "Student B" },
    5: { id: 5, role: "admin", adminLevel: 1, name: "Teacher B" },
  };
  for (const u of Object.values(users))
    await db.query(
      "INSERT INTO users(id,name,email,password_hash,role,admin_level) VALUES($1,$2,$3,$4,$5,$6)",
      [
        u.id,
        u.name,
        `user${u.id}@test.local`,
        "hash",
        u.role,
        u.adminLevel || 0,
      ],
    );
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = users[req.headers["x-test-user"]];
    next();
  });
  const auth = (req, res, next) =>
      req.user ? next() : res.status(401).json({ error: "Login required" }),
    origin = (req, res, next) =>
      req.headers.origin === "http://maihoc.test"
        ? next()
        : res.status(403).json({ error: "Invalid origin" });
  app.use(
    "/api/platform",
    createPlatformRouter({
      db,
      requireAuth: auth,
      requireSameOrigin: origin,
      enabled: () => true,
    }),
  );
  const oldFlag = process.env.MAIHOC_PLATFORM_ENABLED;
  process.env.MAIHOC_PLATFORM_ENABLED = "1";
  process.env.MAIHOC_AI_WORKER_ENABLED = "1";
  process.env.MAIHOC_PERSIST_STUDY_ROOMS = "1";
  installLegacySessions(app, {
    db,
    requireAuth: auth,
    requireSameOrigin: origin,
  });
  installStudyRooms({ app, db, requireAuth: auth, requireSameOrigin: origin });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (
    path,
    method = "GET",
    body,
    user = 1,
    validOrigin = true,
  ) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        "x-test-user": String(user),
        "Content-Type": "application/json",
        Origin: validOrigin ? "http://maihoc.test" : "http://evil.test",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: await response.json().catch(() => ({})),
    };
  };
  let schoolA, schoolB, yearA, classA, classB, question, assignment, attempt;
  try {
    await t.test(
      "migration re-run is idempotent and checksum mismatch aborts",
      async () => {
        assert.deepEqual(await migrate(db), []);
        await db.query(
          "UPDATE app_migrations SET checksum='corrupt' WHERE name LIKE 'platform:%'",
        );
        await assert.rejects(() => migrate(db), /checksum mismatch/);
        const { migrationPlan } = await import("./migrate.js");
        await db.query("UPDATE app_migrations SET checksum=$1 WHERE name=$2", [
          (await migrationPlan())[0].checksum,
          (await migrationPlan())[0].name,
        ]);
      },
    );
    await t.test("auth, CSRF and platform-admin gates", async () => {
      assert.equal(
        (await request("/api/platform/context", "GET", undefined, 99)).status,
        401,
      );
      assert.equal(
        (
          await request(
            "/api/platform/schools",
            "POST",
            { code: "a", name: "A" },
            2,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            "/api/platform/schools",
            "POST",
            { code: "a", name: "A" },
            1,
            false,
          )
        ).status,
        403,
      );
      schoolA = (
        await request("/api/platform/schools", "POST", {
          code: "A",
          name: "School A",
        })
      ).data;
      schoolB = (
        await request("/api/platform/schools", "POST", {
          code: "B",
          name: "School B",
        })
      ).data;
      assert.ok(schoolA.id && schoolB.id);
    });
    await t.test(
      "same class code in different schools stays isolated",
      async () => {
        for (const [school, students] of [
          [schoolA, [2, 3]],
          [schoolB, [4, 5]],
        ])
          for (const user of students)
            assert.equal(
              (
                await request(
                  `/api/platform/schools/${school.id}/members`,
                  "POST",
                  {
                    email: `user${user}@test.local`,
                    role: user % 2 === 0 ? "student" : "teacher",
                  },
                )
              ).status,
              200,
            );
        yearA = (
          await request(`/api/platform/schools/${schoolA.id}/years`, "POST", {
            code: "2026-2027",
            startDate: "2026-08-01",
            endDate: "2027-07-01",
          })
        ).data;
        const yearB = (
          await request(`/api/platform/schools/${schoolB.id}/years`, "POST", {
            code: "2026-2027",
            startDate: "2026-08-01",
            endDate: "2027-07-01",
          })
        ).data;
        classA = (
          await request(`/api/platform/schools/${schoolA.id}/classes`, "POST", {
            academicYearId: yearA.id,
            classCode: "12A1",
            name: "12A1",
            gradeLevel: 12,
          })
        ).data;
        classB = (
          await request(`/api/platform/schools/${schoolB.id}/classes`, "POST", {
            academicYearId: yearB.id,
            classCode: "12A1",
            name: "12A1",
            gradeLevel: 12,
          })
        ).data;
        assert.ok(classA.id && classB.id && classA.id !== classB.id);
        assert.equal(
          (
            await request(
              `/api/platform/schools/${schoolB.id}/overview`,
              "GET",
              undefined,
              2,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              `/api/platform/schools/${schoolA.id}/classes`,
              "POST",
              {
                academicYearId: yearB.id,
                classCode: "bad",
                name: "Bad",
                gradeLevel: 12,
              },
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "enrollment transfers keep history and import is atomic",
      async () => {
        assert.equal(
          (
            await request(
              `/api/platform/schools/${schoolA.id}/enrollments`,
              "POST",
              {
                email: "user2@test.local",
                classId: classA.id,
                reason: "Enrolled",
              },
            )
          ).status,
          200,
        );
        const second = (
          await request(`/api/platform/schools/${schoolA.id}/classes`, "POST", {
            academicYearId: yearA.id,
            classCode: "12A2",
            name: "12A2",
            gradeLevel: 12,
          })
        ).data;
        assert.equal(
          (
            await request(
              `/api/platform/schools/${schoolA.id}/enrollments`,
              "POST",
              {
                email: "user2@test.local",
                classId: second.id,
                reason: "Approved transfer",
              },
            )
          ).status,
          200,
        );
        const history = (
          await db.query(
            "SELECT status FROM student_enrollments WHERE student_id=2 ORDER BY id",
          )
        ).rows;
        assert.deepEqual(
          history.map((x) => x.status),
          ["ended", "active"],
        );
        const before = (
          await db.query("SELECT count(*) AS n FROM student_enrollments")
        ).rows[0].n;
        assert.equal(
          (
            await request(
              `/api/platform/schools/${schoolA.id}/import`,
              "POST",
              {
                classId: classA.id,
                emails: ["user2@test.local", "missing@test.local"],
              },
            )
          ).status,
          400,
        );
        assert.equal(
          (await db.query("SELECT count(*) AS n FROM student_enrollments"))
            .rows[0].n,
          before,
        );
        await request(
          `/api/platform/schools/${schoolA.id}/enrollments`,
          "POST",
          { email: "user2@test.local", classId: classA.id, reason: "Return" },
        );
      },
    );
    await t.test(
      "question approval and immutable assessment snapshot",
      async () => {
        await request(`/api/platform/schools/${schoolA.id}/teachers`, "POST", {
          email: "user3@test.local",
          classId: classA.id,
          subject: "Toán",
          kind: "subject",
        });
        const topic = (
          await request(
            `/api/platform/schools/${schoolA.id}/curriculum`,
            "POST",
            { version: "Pilot v1", subject: "Toán", grade: 12, name: "Hàm số" },
            3,
          )
        ).data;
        question = (
          await request(
            `/api/platform/schools/${schoolA.id}/questions`,
            "POST",
            {
              subject: "Toán",
              grade: 12,
              type: "short_answer",
              stem: "1/2 bằng bao nhiêu?",
              choices: [],
              answer: "0.5",
              curriculumNodeId: topic.id,
              source: "Giáo viên tự soạn",
            },
            3,
          )
        ).data;
        assert.ok(question.id);
        assert.equal(
          (
            await request(
              `/api/platform/schools/${schoolA.id}/questions`,
              "GET",
              undefined,
              2,
            )
          ).status,
          403,
        );
        const body = {
          title: "Bài kiểm tra hàm số",
          classId: classA.id,
          questionIds: [question.id],
          openAt: new Date(Date.now() - 60000),
          closeAt: new Date(Date.now() + 3600000),
          durationMinutes: 30,
        };
        assert.equal(
          (
            await request(
              `/api/platform/schools/${schoolA.id}/assignments`,
              "POST",
              body,
              3,
            )
          ).status,
          400,
        );
        await request(
          `/api/platform/schools/${schoolA.id}/questions/${question.id}/approve`,
          "POST",
          {},
          3,
        );
        assignment = (
          await request(
            `/api/platform/schools/${schoolA.id}/assignments`,
            "POST",
            body,
            3,
          )
        ).data;
        assert.ok(assignment.id);
        const snapshot = (
          await db.query(
            "SELECT snapshot FROM assessment_items WHERE assessment_id=$1",
            [assignment.assessment_id],
          )
        ).rows[0].snapshot;
        assert.equal(snapshot.answer, "0.5");
        assert.equal(
          (
            await request(
              `/api/platform/schools/${schoolA.id}/assignments`,
              "POST",
              body,
              5,
            )
          ).status,
          403,
        );
      },
    );
    await t.test(
      "question revisions create drafts without mutating published snapshots",
      async () => {
        const revision = await request(
          `/api/platform/schools/${schoolA.id}/questions`,
          "POST",
          {
            previousVersionId: question.id,
            subject: "Toán",
            grade: 12,
            type: "short_answer",
            stem: "Một phần tư?",
            choices: [],
            answer: "0.25",
            curriculumNodeId: question.curriculum_node_id,
            source: "Giáo viên chỉnh sửa",
          },
          3,
        );
        assert.equal(revision.status, 201);
        assert.equal(revision.data.version, 2);
        assert.equal(revision.data.status, "draft");
        assert.equal(
          String(revision.data.question_item_id),
          String(question.question_item_id),
        );
        assert.equal(
          (
            await db.query(
              "SELECT snapshot FROM assessment_items WHERE assessment_id=$1",
              [assignment.assessment_id],
            )
          ).rows[0].snapshot.answer,
          "0.5",
        );
      },
    );
    await t.test(
      "start resumes without leaking answer keys; wrong-school student is denied",
      async () => {
        assert.equal(
          (
            await request(
              `/api/platform/assignments/${assignment.id}/start`,
              "POST",
              {},
              4,
            )
          ).status,
          403,
        );
        const first = await request(
          `/api/platform/assignments/${assignment.id}/start`,
          "POST",
          {},
          2,
        );
        assert.equal(first.status, 200);
        attempt = first.data;
        assert.equal(first.data.items[0].answer, undefined);
        assert.equal(first.data.items[0].snapshot, undefined);
        const second = await request(
          `/api/platform/assignments/${assignment.id}/start`,
          "POST",
          {},
          2,
        );
        assert.equal(second.data.attempt.id, attempt.attempt.id);
        assert.equal(
          second.data.attempt.deadline_at,
          attempt.attempt.deadline_at,
        );
        assert.equal(
          (
            await request(
              `/api/platform/ai/jobs`,
              "POST",
              { prompt: "Solve", mode: "hint" },
              2,
            )
          ).status,
          403,
        );
      },
    );
    await t.test(
      "autosave rejects stale versions and other owners",
      async () => {
        const body = { answers: { [attempt.items[0].id]: "1/2" }, version: 0 };
        assert.equal(
          (
            await request(
              `/api/platform/attempts/${attempt.attempt.id}`,
              "PATCH",
              body,
              4,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              `/api/platform/attempts/${attempt.attempt.id}`,
              "PATCH",
              body,
              2,
            )
          ).data.version,
          1,
        );
        assert.equal(
          (
            await request(
              `/api/platform/attempts/${attempt.attempt.id}`,
              "PATCH",
              body,
              2,
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      "submit is idempotent, rational grading works, analytics and grade audit stay scoped",
      async () => {
        const body = {
          answers: { [attempt.items[0].id]: "1/2" },
          idempotencyKey: "submit-one",
        };
        const first = await request(
          `/api/platform/attempts/${attempt.attempt.id}/submit`,
          "POST",
          body,
          2,
        );
        assert.equal(first.status, 200);
        assert.equal(first.data.score, 10);
        assert.equal(
          (
            await request(
              `/api/platform/attempts/${attempt.attempt.id}/submit`,
              "POST",
              body,
              2,
            )
          ).data.score,
          10,
        );
        assert.equal(
          (
            await request(
              `/api/platform/attempts/${attempt.attempt.id}/submit`,
              "POST",
              { ...body, idempotencyKey: "different" },
              2,
            )
          ).status,
          409,
        );
        assert.equal(
          Number(
            (
              await db.query(
                "SELECT count(*) AS n FROM attempt_answers WHERE attempt_id=$1",
                [attempt.attempt.id],
              )
            ).rows[0].n,
          ),
          1,
        );
        const analytics = await request(
          `/api/platform/schools/${schoolA.id}/analytics`,
          "GET",
          undefined,
          2,
        );
        assert.equal(Number(analytics.data.topics[0].correct), 1);
        assert.equal(
          (
            await request(
              `/api/platform/schools/${schoolA.id}/attempts/${attempt.attempt.id}/grade`,
              "POST",
              { score: 8, feedback: "Feedback" },
              5,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              `/api/platform/schools/${schoolA.id}/attempts/${attempt.attempt.id}/grade`,
              "POST",
              { score: 8, feedback: "Feedback" },
              3,
            )
          ).status,
          200,
        );
        const log = (
          await db.query("SELECT detail FROM audit_logs WHERE action='grade'")
        ).rows[0];
        assert.equal(Number(log.detail.before.score), 10);
        assert.equal(log.detail.after.score, 8);
      },
    );
    await t.test(
      "persistent AI queue completes and is private to its owner",
      async () => {
        const job = await request(
          "/api/platform/ai/jobs",
          "POST",
          { prompt: "Gợi ý cách học phân số", mode: "hint" },
          2,
        );
        assert.equal(job.status, 202);
        assert.equal(
          (
            await request(
              `/api/platform/ai/jobs/${job.data.id}`,
              "GET",
              undefined,
              4,
            )
          ).status,
          404,
        );
        assert.equal(
          await workOnce({
            database: db,
            solve: async (payload) => ({
              answer: "Hãy thử quy đồng.",
              mode: payload.mode,
            }),
          }),
          true,
        );
        const done = await request(
          `/api/platform/ai/jobs/${job.data.id}`,
          "GET",
          undefined,
          2,
        );
        assert.equal(done.data.status, "completed");
        assert.equal(done.data.result.mode, "hint");
        assert.equal(
          await workOnce({
            database: db,
            solve: async () => {
              throw new Error("Should not run twice");
            },
          }),
          false,
        );
      },
    );
    await t.test(
      "native deadlines accept only acknowledged drafts after timeout",
      async () => {
        const extra = await request(
          `/api/platform/schools/${schoolA.id}/assignments`,
          "POST",
          {
            title: "Timeout",
            classId: classA.id,
            questionIds: [question.id],
            openAt: new Date(Date.now() - 60000),
            closeAt: new Date(Date.now() + 3600000),
            durationMinutes: 30,
          },
          3,
        );
        const a = (
          await request(
            `/api/platform/assignments/${extra.data.id}/start`,
            "POST",
            {},
            2,
          )
        ).data;
        await request(
          `/api/platform/attempts/${a.attempt.id}`,
          "PATCH",
          { answers: { [a.items[0].id]: "1/2" }, version: 0 },
          2,
        );
        await db.query(
          "UPDATE assessment_attempts SET deadline_at=now()-interval '1 second' WHERE id=$1",
          [a.attempt.id],
        );
        assert.equal(
          (
            await request(
              `/api/platform/attempts/${a.attempt.id}`,
              "PATCH",
              { answers: {}, version: 1 },
              2,
            )
          ).status,
          409,
        );
        const result = await request(
          `/api/platform/attempts/${a.attempt.id}/submit`,
          "POST",
          { answers: { [a.items[0].id]: "wrong" }, idempotencyKey: "late" },
          2,
        );
        assert.equal(result.data.score, 10);
      },
    );
    await t.test(
      "new true/false items preserve progressive scoring",
      async () => {
        const q = (
          await request(
            `/api/platform/schools/${schoolA.id}/questions`,
            "POST",
            {
              subject: "Toán",
              grade: 12,
              type: "true_false",
              stem: "Bốn mệnh đề",
              choices: ["a", "b", "c", "d"],
              answer: "[true,true,true,true]",
              curriculumNodeId: question.curriculum_node_id,
              source: "Tự soạn",
            },
            3,
          )
        ).data;
        assert.ok(q.id);
        await request(
          `/api/platform/schools/${schoolA.id}/questions/${q.id}/approve`,
          "POST",
          {},
          3,
        );
        const a = (
          await request(
            `/api/platform/schools/${schoolA.id}/assignments`,
            "POST",
            {
              title: "Đúng sai",
              classId: classA.id,
              questionIds: [q.id],
              openAt: new Date(Date.now() - 60000),
              closeAt: new Date(Date.now() + 3600000),
              durationMinutes: 30,
            },
            3,
          )
        ).data;
        const started = (
          await request(
            `/api/platform/assignments/${a.id}/start`,
            "POST",
            {},
            2,
          )
        ).data;
        const id = started.items[0].id;
        const result = await request(
          `/api/platform/attempts/${started.attempt.id}/submit`,
          "POST",
          {
            answers: {
              [id + "_0"]: "true",
              [id + "_1"]: "true",
              [id + "_2"]: "false",
              [id + "_3"]: "false",
            },
            idempotencyKey: "tf-partial",
          },
          2,
        );
        assert.equal(result.status, 200);
        assert.equal(result.data.score, 2.5);
      },
    );
    await t.test("term bounds and course school/year integrity", async () => {
      const path = `/api/platform/schools/${schoolA.id}/terms`;
      assert.equal(
        (
          await request(path, "POST", {
            academicYearId: yearA.id,
            name: "Invalid",
            startDate: "2025-01-01",
            endDate: "2026-10-01",
          })
        ).status,
        400,
      );
      const term = await request(path, "POST", {
        academicYearId: yearA.id,
        name: "Học kỳ I",
        startDate: "2026-08-01",
        endDate: "2026-12-31",
      });
      assert.equal(term.status, 201);
      assert.equal(
        (
          await request(`/api/platform/schools/${schoolA.id}/courses`, "POST", {
            classId: classA.id,
            termId: term.data.id,
            subject: "Toán",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await request(`/api/platform/schools/${schoolA.id}/courses`, "POST", {
            classId: classB.id,
            termId: term.data.id,
            subject: "Toán",
          })
        ).status,
        400,
      );
    });
    await t.test(
      "remediation creates a private practice assignment with reviewed questions",
      async () => {
        const topic = (
          await db.query(
            "SELECT curriculum_node_id FROM question_versions WHERE id=$1",
            [question.id],
          )
        ).rows[0].curriculum_node_id;
        const practice = await request(
          `/api/platform/schools/${schoolA.id}/practice`,
          "POST",
          { topicId: topic },
          2,
        );
        assert.equal(practice.status, 201);
        assert.equal(
          (
            await request(
              `/api/platform/assignments/${practice.data.id}/start`,
              "POST",
              {},
              4,
            )
          ).status,
          403,
        );
        const started = await request(
          `/api/platform/assignments/${practice.data.id}/start`,
          "POST",
          {},
          2,
        );
        assert.equal(started.status, 200);
        assert.equal(started.data.items[0].answer, undefined);
        assert.equal(
          (
            await request(
              `/api/platform/schools/${schoolA.id}/practice`,
              "POST",
              { topicId: topic },
              4,
            )
          ).status,
          403,
        );
      },
    );
    await t.test(
      "study timer is host-controlled and metadata survives outside RAM",
      async () => {
        const created = await request(
          "/api/study-rooms",
          "POST",
          { name: "Phòng ôn tập", password: "test" },
          2,
        );
        assert.equal(created.status, 201);
        const rid = created.data.roomId;
        assert.equal(
          (
            await request(
              `/api/study-rooms/${rid}/timer`,
              "POST",
              { minutes: 25 },
              4,
            )
          ).status,
          403,
        );
        const timer = await request(
          `/api/study-rooms/${rid}/timer`,
          "POST",
          { minutes: 25 },
          2,
        );
        assert.equal(timer.data.timer.phase, "focus");
        const record = (
          await db.query(
            "SELECT timer,password_hash FROM study_room_metadata WHERE id=$1",
            [rid],
          )
        ).rows[0];
        assert.equal(record.timer.phase, "focus");
        assert.notEqual(record.password_hash, "test");
        assert.equal(
          (await request(`/api/study-rooms/${rid}/close`, "POST", {}, 4))
            .status,
          403,
        );
        assert.equal(
          (await request(`/api/study-rooms/${rid}/close`, "POST", {}, 2))
            .status,
          200,
        );
        assert.equal(
          (
            await db.query("SELECT id FROM study_room_metadata WHERE id=$1", [
              rid,
            ])
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "legacy roster and canonical enrollment project atomically in both directions",
      async () => {
        const cls = (
          await request(`/api/platform/schools/${schoolA.id}/classes`, "POST", {
            academicYearId: yearA.id,
            classCode: "12C1",
            name: "Legacy 12C1",
            gradeLevel: 12,
          })
        ).data;
        await db.query(
          "INSERT INTO platform_settings(name,value) VALUES('legacy_sync_actor_id','1'),('legacy_school_id',$1)",
          [String(schoolA.id)],
        );
        await db.query(
          "INSERT INTO legacy_class_mappings(class_code,school_id,academic_year_id,class_id) VALUES($1,$2,$3,$4)",
          ["12C1", schoolA.id, yearA.id, cls.id],
        );
        const transferred = await request(
          `/api/platform/schools/${schoolA.id}/enrollments`,
          "POST",
          {
            email: "user2@test.local",
            classId: cls.id,
            reason: "Approved compatibility transfer",
          },
        );
        assert.equal(transferred.status, 200);
        assert.equal(
          (
            await db.query(
              "SELECT class_code FROM school_class_members WHERE user_id=2 AND class_code='12C1'",
            )
          ).rows.length,
          1,
        );
        await db.query(
          "DELETE FROM school_class_members WHERE user_id=2 AND class_code='12C1'",
        );
        assert.equal(
          (
            await db.query(
              "SELECT id FROM student_enrollments WHERE student_id=2 AND class_id=$1 AND status='active'",
              [cls.id],
            )
          ).rows.length,
          0,
        );
        await db.query(
          "INSERT INTO school_class_members(user_id,class_code) VALUES(2,'12C1')",
        );
        assert.equal(
          (
            await db.query(
              "SELECT id FROM student_enrollments WHERE student_id=2 AND class_id=$1 AND status='active'",
              [cls.id],
            )
          ).rows.length,
          1,
        );
      },
    );
    await t.test(
      "legacy test session enforces class/grade and restores server draft",
      async () => {
        await db.exec(
          "CREATE TABLE IF NOT EXISTS school_class_members(user_id BIGINT,class_code TEXT,created_at TEXT DEFAULT 'now',PRIMARY KEY(user_id,class_code))",
        );
        await db.query(
          "INSERT INTO school_class_members(user_id,class_code) VALUES(2,'12A1'),(4,'11B1')",
        );
        await db.query(
          "INSERT INTO documents(id,subject,grade,category,title,filename,original_name,size,content_type) VALUES('old-test','Toán','12','test','Old','old.pdf','old.pdf',0,'application/pdf')",
        );
        await db.query(
          "INSERT INTO tests(id,document_id,title,subject,grade,open_at,close_at,duration_minutes,class_code) VALUES('old-test','old-test','Old','Toán','12',$1,$2,30,'ALL')",
          [
            new Date(Date.now() - 60000).toISOString(),
            new Date(Date.now() + 3600000).toISOString(),
          ],
        );
        assert.equal(
          (await request("/api/tests/old-test/session", "POST", {}, 4)).status,
          403,
        );
        const session = (
          await request("/api/tests/old-test/session", "POST", {}, 2)
        ).data.session;
        assert.ok(session.id);
        assert.equal(
          (
            await request(
              "/api/tests/old-test/session",
              "PATCH",
              { answers: { "I-1": "A" }, version: 0 },
              2,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              "/api/tests/old-test/session",
              "PATCH",
              { answers: { "I-1": "B" }, version: 0 },
              2,
            )
          ).status,
          409,
        );
        const resumed = (
          await request("/api/tests/old-test/session", "POST", {}, 2)
        ).data.session;
        assert.equal(resumed.answers["I-1"], "A");
        assert.equal(resumed.deadline_at, session.deadline_at);
      },
    );
  } finally {
    if (oldFlag === undefined) delete process.env.MAIHOC_PLATFORM_ENABLED;
    else process.env.MAIHOC_PLATFORM_ENABLED = oldFlag;
    await new Promise((r) => server.close(r));
    await fixture.close();
  }
});
test("routing, validation and AI pedagogy contracts", () => {
  assert.equal(
    parseRoute(new URL("https://maihoc.test/learning/tests/test-123"))
      .pendingTestId,
    "test-123",
  );
  assert.equal(
    parseRoute(new URL("https://maihoc.test/learning/documents/doc%20one"))
      .docId,
    "doc one",
  );
  assert.equal(
    routeUrl({ route: "school-class", classCode: "12A1" }),
    "/school/classes/12A1",
  );
  assert.throws(() => cleanAnswers({ a: { nested: true } }), /không hợp lệ/);
  assert.equal(
    deadlineFor("2026-01-01T00:00Z", "2026-01-01T00:10Z", 30).toISOString(),
    "2026-01-01T00:10:00.000Z",
  );
  assert.match(tutorInstruction("hint"), /Không đưa đáp số/);
  assert.match(tutorInstruction("check"), /bước sai đầu tiên/);
  assert.deepEqual(geminiModels("verified-model").slice(0, 1), [
    "verified-model",
  ]);
});
