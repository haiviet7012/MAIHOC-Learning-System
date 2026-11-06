import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { testDatabase } from "../platform/test-db.js";
import { ensureAccountUpgrade } from "../account-upgrade.js";
import { createSchoolUpgradeRouter } from "./routes.js";
import { workDocumentOnce, matchAnswers } from "./documents.js";
import { geminiConfig } from "../ai-provider.js";
import { spatialSample } from "../../physics-lab/core/spatial-models.js";
import { summarizeEvidence } from "../learning-advisor/evidence.js";
import { reserveSeat } from "../study-rooms/school.js";
import { randomUUID } from "node:crypto";

test("dedicated AI never falls back to shared keys", () => {
  const env = {
    GEMINI_API_KEY: "shared",
    GEMINI_MODEL: "shared-model",
    ROOM_AI_API_KEY: "room",
    ROOM_AI_MODEL: "room-model",
  };
  assert.equal(geminiConfig("room", env).apiKey, "room");
  assert.throws(
    () => geminiConfig("document", env),
    /SCHOOL_DOCUMENT_AI_API_KEY/,
  );
  assert.throws(
    () => geminiConfig("room", { ...env, ROOM_AI_API_KEY: "" }),
    /ROOM_AI_API_KEY/,
  );
});
test("answer matching detects duplicates, missing and extra answers", () => {
  const r = matchAnswers(
    {
      items: [
        { label: "1", section: "I", stem: "A" },
        { label: "2", section: "I", stem: "B" },
      ],
    },
    {
      items: [
        { label: "1", section: "I", answer: "A" },
        { label: "1", section: "I", answer: "B" },
        { label: "3", section: "I", answer: "C" },
      ],
    },
  );
  assert.equal(r.items[0].answer, "");
  assert.equal(r.items[1].answer, "");
  assert.ok(r.matchWarnings.length >= 3);
});
test("spatial models preserve period and projectile range; field follows inverse radius", () => {
  const p = { field: 5, speed: 100, angle: 90 },
    s = spatialSample("helix", p, 0),
    end = spatialSample("helix", p, s.period);
  assert.ok(Math.abs(end.x) < 1e-12);
  assert.ok(Math.abs(end.y) < 1e-12);
  const shot = spatialSample(
      "projectile",
      { speed: 10, angle: 45, azimuth: 0 },
      0,
    ),
    land = spatialSample(
      "projectile",
      { speed: 10, angle: 45, azimuth: 0 },
      shot.flightTime,
    );
  assert.ok(Math.abs(land.x - shot.range) < 1e-10);
  assert.ok(land.y < 1e-10);
  assert.equal(
    spatialSample("field", { current: 10, radius: 10 }, 0).magneticField / 2,
    spatialSample("field", { current: 10, radius: 20 }, 0).magneticField,
  );
  assert.throws(() =>
    spatialSample("helix", { field: 0, speed: 1, angle: 30 }, 0),
  );
});
test("repeated questions are not independent evidence", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    student_id: 1,
    question_item_id: 7,
    topic_id: 3,
    correct: false,
    attempt_id: i,
    submitted_at: new Date(2026, 0, i + 1).toISOString(),
  }));
  const g = summarizeEvidence(rows)[0];
  assert.equal(g.observations, 1);
  assert.equal(g.dataLevel, "insufficient");
});

test("School upgrade persistence, isolation, worker and approvals", async (t) => {
  const fixture = await testDatabase({ memoryOnly: true }),
    db = fixture.db;
  await ensureAccountUpgrade(db);
  const users = {
    1: { id: 1, name: "Teacher", role: "admin", adminLevel: 1 },
    2: { id: 2, name: "Student", role: "user", schoolPlan: "legacy" },
    3: { id: 3, name: "Other", role: "user", schoolPlan: "legacy" },
    4: { id: 4, name: "External", role: "user", schoolPlan: "none" },
  };
  for (const u of Object.values(users))
    await db.query(
      "INSERT INTO users(id,name,email,password_hash,role,admin_level,school_plan) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        u.id,
        u.name,
        `${u.id}@test.local`,
        "hash",
        u.role,
        u.adminLevel || 0,
        u.schoolPlan || "legacy",
      ],
    );
  const sid = (
    await db.query(
      "INSERT INTO schools(code,name) VALUES('UP','Upgrade') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO school_upgrade_access(school_id,daily_ai_calls) VALUES($1,20)",
    [sid],
  );
  for (const id of [1, 2])
    await db.query(
      "INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,$2,$3)",
      [sid, id, id === 1 ? "teacher" : "student"],
    );
  const year = (
    await db.query(
      "INSERT INTO academic_years(school_id,code,start_date,end_date) VALUES($1,'2026','2026-01-01','2027-01-01') RETURNING id",
      [sid],
    )
  ).rows[0].id;
  const cls = (
    await db.query(
      "INSERT INTO classes(school_id,academic_year_id,class_code,name,grade_level) VALUES($1,$2,'12A','12A',12) RETURNING id",
      [sid, year],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO teacher_course_assignments(school_id,class_id,teacher_id,subject,kind) VALUES($1,$2,1,'Toán','subject')",
    [sid, cls],
  );
  await db.query(
    "INSERT INTO student_enrollments(school_id,academic_year_id,class_id,student_id,reason,approved_by) VALUES($1,$2,$3,2,'test',1)",
    [sid, year, cls],
  );
  const storeMap = new Map(),
    store = {
      put: async (k, b) => storeMap.set(k, b),
      get: async (k) => storeMap.get(k),
      delete: async (k) => storeMap.delete(k),
    };
  const envKeys = [
    "LIVEKIT_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "MAIHOC_SCHOOL_RECORDING_ENABLED",
    "R2_BUCKET_NAME",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_ACCOUNT_ID",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    LIVEKIT_URL: "wss://fixture.invalid",
    LIVEKIT_API_KEY: "fixture-key",
    LIVEKIT_API_SECRET: "fixture-secret-not-real",
    MAIHOC_SCHOOL_RECORDING_ENABLED: "1",
    R2_BUCKET_NAME: "fixture",
    R2_ACCESS_KEY_ID: "fixture",
    R2_SECRET_ACCESS_KEY: "fixture",
    R2_ACCOUNT_ID: "fixture",
  });
  t.after(() => {
    for (const key of envKeys) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
  });
  let participants = [],
    egressStatus = 1,
    screenPermission;
  const services = () => ({
    rooms: {
      createRoom: async () => ({}),
      listParticipants: async () => participants,
      updateParticipant: async (_room, _user, opts) => {
        screenPermission = opts.permission;
      },
      removeParticipant: async () => {},
      deleteRoom: async () => {},
    },
    egress: {
      startRoomCompositeEgress: async (_room, output) => {
        assert.equal(output.fileType, 1);
        assert.ok(output.filepath.endsWith(".mp4"));
        return { egressId: "EG_fixture" };
      },
      listEgress: async () => [
        { egressId: "EG_fixture", status: egressStatus },
      ],
      stopEgress: async () => {
        egressStatus = 3;
      },
    },
  });
  let enabled = true;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = users[req.headers["x-user"]];
    next();
  });
  app.use(
    "/api/school/upgrade",
    createSchoolUpgradeRouter({
      db,
      store,
      services,
      generate: async () => ({ answer: "Phản hồi AI riêng", model: "fixture" }),
      enabled: () => enabled,
      requireAuth: (q, r, n) => (q.user ? n() : r.sendStatus(401)),
      requireSameOrigin: (q, r, n) =>
        q.headers.origin === "http://test.local" ? n() : r.sendStatus(403),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api/school/upgrade`;
  async function call(
    path,
    method = "GET",
    body,
    user = 2,
    origin = "http://test.local",
  ) {
    const r = await fetch(base + path, {
      method,
      headers: {
        "x-user": String(user),
        Origin: origin,
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
    const bytes = Buffer.from(await r.arrayBuffer());
    let data;
    try {
      data = JSON.parse(bytes.toString());
    } catch {}
    return { status: r.status, data, bytes };
  }
  let exam, answers;
  try {
    await t.test("auth, CSRF, explicit pilot and flag gates", async () => {
      assert.equal(
        (await call("/capabilities", "GET", undefined, 99)).status,
        401,
      );
      assert.equal(
        (await call("/capabilities", "GET", undefined, 4)).status,
        403,
      );
      assert.equal(
        (await call(`/documents?schoolId=${sid}`, "GET", undefined, 3)).status,
        403,
      );
      enabled = false;
      assert.equal((await call("/capabilities")).data.enabled, false);
      assert.equal((await call("/documents", "POST", {})).status, 503);
      enabled = true;
      assert.equal(
        (await call("/documents", "POST", {}, 2, "http://evil.local")).status,
        403,
      );
      await db.query(
        "UPDATE school_upgrade_access SET expires_at=now()-interval '1 hour' WHERE school_id=$1",
        [sid],
      );
      assert.equal((await call(`/documents?schoolId=${sid}`)).status, 403);
      await db.query(
        "UPDATE school_upgrade_access SET expires_at=NULL WHERE school_id=$1",
        [sid],
      );
    });
    async function manual(kind, content, user = 2) {
      const f = new FormData();
      for (const [k, v] of Object.entries({
        schoolId: sid,
        kind,
        title: "Đề thử tiếng Việt",
        subject: "Toán",
        content: JSON.stringify(content),
        requestKey: randomUUID(),
      }))
        f.set(k, v);
      return call("/documents", "POST", f, user);
    }
    await t.test(
      "manual review, private ownership, matching and revision conflict",
      async () => {
        exam = (
          await manual("exam", {
            items: [
              {
                label: "1",
                section: "I",
                stem: "Một cộng một bằng mấy?",
                choices: ["Một", "Hai"],
                answer: "",
              },
            ],
          })
        ).data.id;
        answers = (
          await manual("answers", {
            items: [{ label: "1", section: "I", answer: "B" }],
          })
        ).data.id;
        assert.ok(exam && answers);
        assert.equal(
          (await call(`/documents/${exam}`, "GET", undefined, 3)).status,
          404,
        );
        let r = await call(`/documents/${exam}/match`, "POST", {
          answerId: answers,
        });
        assert.equal(r.status, 200);
        assert.equal(r.data.result.items[0].answer, "B");
        assert.equal(
          (await call(`/documents/${exam}/pdf?mode=complete`)).status,
          409,
        );
        const patch = {
          result: r.data.result,
          revision: r.data.revision,
          confirmed: true,
        };
        assert.equal(
          (await call(`/documents/${exam}`, "PATCH", patch)).status,
          200,
        );
        assert.equal(
          (await call(`/documents/${exam}`, "PATCH", patch)).status,
          409,
        );
        const pdf = await call(`/documents/${exam}/pdf?mode=complete`);
        assert.equal(pdf.status, 200);
        assert.equal(pdf.bytes.subarray(0, 5).toString(), "%PDF-");
        assert.equal(
          (await call(`/documents/${exam}/publish`, "POST", { topicId: 1 }))
            .status,
          403,
        );
      },
    );
    await t.test(
      "uploaded source, durable worker, unsupported file and no shared-key fallback",
      async () => {
        const bad = new FormData();
        for (const [k, v] of Object.entries({
          schoolId: sid,
          kind: "notebook",
          title: "Vở",
          subject: "Toán",
          requestKey: randomUUID(),
        }))
          bad.set(k, v);
        bad.set(
          "file",
          new Blob(["not a PDF"], { type: "application/pdf" }),
          "wrong.pdf",
        );
        assert.equal((await call("/documents", "POST", bad)).status, 415);
        const f = new FormData();
        for (const [k, v] of Object.entries({
          schoolId: sid,
          kind: "notebook",
          title: "Vở",
          subject: "Toán",
          requestKey: randomUUID(),
        }))
          f.set(k, v);
        f.set(
          "file",
          new Blob(
            [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
            { type: "image/png" },
          ),
          "scan.png",
        );
        const created = await call("/documents", "POST", f);
        assert.equal(created.status, 201);
        await workDocumentOnce({
          db,
          store,
          generate: async () => ({
            transcript: "1 + 1 = 3",
            warnings: ["Cần đối chiếu"],
          }),
        });
        const r = await call(`/documents/${created.data.id}`);
        assert.equal(r.data.status, "needs_review");
        assert.equal(r.data.result.transcript, "1 + 1 = 3");
        assert.equal(
          (await call(`/documents/${created.data.id}/source`)).status,
          200,
        );
      },
    );
    await t.test(
      "capacity counts reservations and active SFU participants including stale heartbeats",
      async () => {
        const id = randomUUID();
        await db.query(
          "INSERT INTO school_room_sessions(id,school_id,owner_id,title) VALUES($1,$2,1,'Room')",
          [id, sid],
        );
        const room = { id };
        const participants = Array.from({ length: 50 }, (_, i) => ({
          identity: String(i + 100),
          permission: { hidden: false },
        }));
        await assert.rejects(
          () =>
            db.transaction(() =>
              reserveSeat(db, room, users[2], participants),
            )(),
          /50 người/,
        );
        await db.transaction(() => reserveSeat(db, room, users[2], []))();
        await db.transaction(() => reserveSeat(db, room, users[2], []))();
        assert.equal(
          (
            await db.query(
              "SELECT count(*) AS n FROM school_room_members WHERE room_id=$1",
              [id],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "evidence proposes a draft only; teacher approval assigns once with snapshots",
      async () => {
        const version = (
          await db.query(
            "INSERT INTO curriculum_versions(school_id,name) VALUES($1,'v1') RETURNING id",
            [sid],
          )
        ).rows[0].id;
        const topic = (
          await db.query(
            "INSERT INTO curriculum_nodes(school_id,curriculum_version_id,subject,grade,name) VALUES($1,$2,'Toán',12,'Đạo hàm') RETURNING id",
            [sid, version],
          )
        ).rows[0].id;
        for (let batch = 0; batch < 2; batch++) {
          const assessment = (
            await db.query(
              "INSERT INTO assessments(school_id,title,created_by,subject) VALUES($1,'Bài khảo sát',1,'Toán') RETURNING id",
              [sid],
            )
          ).rows[0].id;
          const assignment = (
            await db.query(
              "INSERT INTO assessment_assignments(school_id,assessment_id,class_id,open_at,close_at,duration_minutes) VALUES($1,$2,$3,now()-interval '1 hour',now()+interval '1 day',30) RETURNING id",
              [sid, assessment, cls],
            )
          ).rows[0].id;
          const attempt = (
            await db.query(
              "INSERT INTO assessment_attempts(school_id,assignment_id,assessment_id,student_id,deadline_at,status,submitted_at) VALUES($1,$2,$3,2,now()+interval '1 day','graded',now()) RETURNING id",
              [sid, assignment, assessment],
            )
          ).rows[0].id;
          for (let i = 0; i < 3; i++) {
            const item = (
              await db.query(
                "INSERT INTO question_items(school_id,created_by) VALUES($1,1) RETURNING id",
                [sid],
              )
            ).rows[0].id;
            const q = (
              await db.query(
                "INSERT INTO question_versions(school_id,question_item_id,version,subject,grade,curriculum_node_id,type,stem,answer,source,status) VALUES($1,$2,1,'Toán',12,$3,'short_answer','Đạo hàm x','1','test','approved') RETURNING id",
                [sid, item, topic],
              )
            ).rows[0].id;
            const ai = (
              await db.query(
                "INSERT INTO assessment_items(school_id,assessment_id,question_version_id,position,snapshot) VALUES($1,$2,$3,$4,$5) RETURNING id",
                [
                  sid,
                  assessment,
                  q,
                  i,
                  JSON.stringify({
                    stem: "Đạo hàm x",
                    type: "short_answer",
                    answer: "1",
                    curriculumNodeId: topic,
                  }),
                ],
              )
            ).rows[0].id;
            await db.query(
              "INSERT INTO attempt_answers(assessment_id,attempt_id,assessment_item_id,answer,correct,points) VALUES($1,$2,$3,'0',false,0)",
              [assessment, attempt, ai],
            );
          }
        }
        const filter = { classId: cls, subject: "Toán", topicId: topic };
        const evidence = await call(
          `/schools/${sid}/evidence?classId=${cls}&subject=Toán`,
          "GET",
          undefined,
          1,
        );
        assert.equal(evidence.status, 200);
        assert.equal(evidence.data.groups[0].observations, 6);
        assert.equal(evidence.data.groups[0].dataLevel, "preliminary");
        const before = Number(
          (await db.query("SELECT count(*) AS n FROM assessment_assignments"))
            .rows[0].n,
        );
        const draft = await call(
          `/schools/${sid}/interventions`,
          "POST",
          filter,
          1,
        );
        assert.equal(draft.status, 201);
        assert.equal(
          Number(
            (await db.query("SELECT count(*) AS n FROM assessment_assignments"))
              .rows[0].n,
          ),
          before,
        );
        const approve = `/schools/${sid}/interventions/${draft.data.id}/approve`;
        let r = await call(approve, "POST", filter, 1);
        assert.equal(r.status, 200);
        assert.equal(r.data.status, "assigned");
        assert.equal(r.data.assignment_ids.length, 1);
        const ids = r.data.assignment_ids;
        r = await call(approve, "POST", filter, 1);
        assert.deepEqual(r.data.assignment_ids, ids);
        assert.equal(
          Number(
            (await db.query("SELECT count(*) AS n FROM assessment_assignments"))
              .rows[0].n,
          ),
          before + 1,
        );
        const ownFilter = await call(
          `/schools/${sid}/evidence?classId=${cls}&subject=Toán`,
        );
        assert.equal(
          ownFilter.data.groups.every((g) => Number(g.studentId) === 2),
          true,
        );
      },
    );
    await t.test(
      "teacher publication creates immutable bank drafts exactly once",
      async () => {
        const doc = await manual(
          "exam",
          { items: [{ label: "1", stem: "Tính 1 + 1", answer: "2" }] },
          1,
        );
        const id = doc.data.id;
        const j = (await call(`/documents/${id}`, "GET", undefined, 1)).data;
        assert.equal(
          (
            await call(
              `/documents/${id}`,
              "PATCH",
              { result: j.result, revision: j.revision, confirmed: true },
              1,
            )
          ).status,
          200,
        );
        const topic = (
          await db.query(
            "SELECT id FROM curriculum_nodes WHERE school_id=$1 LIMIT 1",
            [sid],
          )
        ).rows[0].id;
        const published = await call(
          `/documents/${id}/publish`,
          "POST",
          { topicId: topic },
          1,
        );
        assert.equal(published.status, 200);
        assert.equal(published.data.questionIds.length, 1);
        // A second document with repeated content reuses the bank question.
        const repeated = await manual("exam", { items: [
          { label: "1", stem: "Tính 1 + 1", answer: "2" },
          { label: "2", stem: "  Tính 1 + 1  ", answer: "2" },
        ] }, 1);
        const repeatedJob = (await call(`/documents/${repeated.data.id}`, "GET", undefined, 1)).data;
        assert.equal((await call(`/documents/${repeated.data.id}`, "PATCH", { result: repeatedJob.result, revision: repeatedJob.revision, confirmed: true }, 1)).status, 200);
        const repeatedPublication = await call(`/documents/${repeated.data.id}/publish`, "POST", { topicId: topic }, 1);
        assert.equal(repeatedPublication.status, 200);
        assert.deepEqual(repeatedPublication.data.questionIds, published.data.questionIds);
        assert.deepEqual(
          (
            await call(
              `/documents/${id}/publish`,
              "POST",
              { topicId: topic },
              1,
            )
          ).data.questionIds,
          published.data.questionIds,
        );
        assert.equal(
          (
            await db.query(
              "SELECT status,type FROM question_versions WHERE id=$1",
              [published.data.questionIds[0]],
            )
          ).rows[0].status,
          "draft",
        );
        assert.equal(
          (
            await call(
              `/documents/${id}`,
              "PATCH",
              { result: j.result, revision: 1, confirmed: true },
              1,
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      "active exams block new AI workflows and private supporting documents",
      async () => {
        const base = (
          await db.query(
            "SELECT * FROM assessment_assignments ORDER BY id LIMIT 1",
          )
        ).rows[0];
        const assignment = (
          await db.query(
            "INSERT INTO assessment_assignments(school_id,assessment_id,class_id,open_at,close_at,duration_minutes) VALUES($1,$2,$3,now(),now()+interval '1 day',30) RETURNING id",
            [sid, base.assessment_id, cls],
          )
        ).rows[0].id;
        const attempt = (
          await db.query(
            "INSERT INTO assessment_attempts(school_id,assignment_id,assessment_id,student_id,deadline_at) VALUES($1,$2,$3,2,now()+interval '1 hour') RETURNING id",
            [sid, assignment, base.assessment_id],
          )
        ).rows[0].id;
        assert.equal((await call(`/documents/${exam}`)).status, 403);
        assert.equal((await call(`/documents/${exam}/pdf`)).status, 403);
        await db.query(
          "UPDATE assessment_attempts SET status='graded' WHERE id=$1",
          [attempt],
        );
      },
    );
    await t.test(
      "room transport, consent, separate AI and MP4 lifecycle via injected SFU",
      async () => {
        const made = await call(
          "/rooms",
          "POST",
          { schoolId: sid, title: "Học nhóm", classId: cls },
          1,
        );
        assert.equal(made.status, 201);
        const id = made.data.id;
        assert.equal(
          (await call(`/rooms/${id}/token`, "POST", { consent: false }, 1))
            .status,
          400,
        );
        assert.equal(
          (await call(`/rooms/${id}/token`, "POST", { consent: true }, 1))
            .status,
          200,
        );
        participants = [{ identity: "1", permission: { hidden: false } }];
        assert.equal(
          (await call(`/rooms/${id}/token`, "POST", { consent: true })).status,
          200,
        );
        participants.push({ identity: "2", permission: { hidden: false } });
        assert.equal(
          (await call(`/rooms/${id}/screen`, "POST", { enabled: true })).status,
          200,
        );
        assert.ok(screenPermission.canPublishSources.includes(3));
        assert.equal(
          (await call(`/rooms/${id}/recordings`, "POST", {})).status,
          403,
        );
        const recorded = await call(`/rooms/${id}/recordings`, "POST", {}, 1);
        assert.equal(recorded.status, 201);
        const key = randomUUID();
        let ai = await call(`/rooms/${id}/ai/messages`, "POST", {
          message: "Giải 1+1",
          requestKey: key,
        });
        assert.equal(ai.status, 200);
        assert.equal(ai.data.answer, "Phản hồi AI riêng");
        assert.deepEqual(
          (
            await call(`/rooms/${id}/ai/messages`, "POST", {
              message: "Giải 1+1",
              requestKey: key,
            })
          ).data,
          ai.data,
        );
        let state = await call(`/rooms/${id}/state`);
        assert.equal(state.data.messages.length, 0);
        assert.equal(state.data.recordings[0].status, "recording");
        assert.equal(
          (
            await call(
              `/rooms/${id}/recordings/${recorded.data.id}/stop`,
              "POST",
              {},
              1,
            )
          ).status,
          200,
        );
        state = await call(`/rooms/${id}/state`);
        assert.equal(state.data.recordings[0].status, "ready");
        assert.equal(
          (await call(`/rooms/${id}/lock`, "POST", { locked: true }, 1)).status,
          200,
        );
        assert.equal(
          (await call(`/rooms/${id}/token`, "POST", { consent: true })).status,
          403,
        );
      },
    );
    await t.test(
      "teacher cannot see evidence for an unassigned subject",
      async () => {
        assert.equal(
          (
            await call(
              `/schools/${sid}/evidence?classId=${cls}&subject=Toán`,
              "GET",
              undefined,
              1,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await call(
              `/schools/${sid}/evidence?classId=${cls}&subject=Vật+lý`,
              "GET",
              undefined,
              1,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await call(`/schools/${sid}/interventions`, "POST", {
              classId: cls,
              subject: "Toán",
              topicId: 1,
            })
          ).status,
          403,
        );
      },
    );
  } finally {
    await new Promise((r) => server.close(r));
    await fixture.close();
  }
});
