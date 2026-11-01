import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { testDatabase } from "./test-db.js";
import { installLearningAdvisor } from "../learning-advisor/routes.js";
import { summarize, vnDay, snapshot } from "../learning-advisor/analytics.js";
import { advise, validateAdvice } from "../learning-advisor/gemini.js";

test("advisor metrics normalize scales, preserve zero, exclude missing and use Vietnam dates", () => {
  const result = summarize([
    { subject: "Toán", score: 0, scale: 10, at: "2026-11-01 18:00:00" },
    { subject: "Toán", score: 8, scale: 10, at: "2026-11-01 18:00:00" },
    { subject: "IELTS", score: 6, scale: 9, at: "2026-11-01 18:00:00" },
    { subject: "Pending", score: null, scale: 10, at: "2026-11-01 18:00:00" },
  ]);
  assert.equal(vnDay("2026-11-01 18:00:00"), "2026-11-02");
  assert.equal(result.observations, 3);
  assert.equal(result.radar.find((r) => r.subject === "Toán").percent, 40);
  assert.equal(result.radar.find((r) => r.subject === "IELTS").percent, 66.7);
  assert.equal(result.radarDaily.length, 1);
  assert.equal(summarize([]).daily.length, 0);
});
test("advisor prefers dedicated configuration, supports shared Gemini and validates provider output", async () => {
  await assert.rejects(
    advise(
      {},
      {
        env: {
          LEARNING_ADVISOR_MODEL: "gemini-3.6-flash",
        },
        fetcher: () => {
          throw Error("must not call");
        },
      },
    ),
    /cấu hình/,
  );
  let sent;
  const result = await advise(
    { mode: "chat", message: "Toán", context: {}, history: [] },
    {
      env: {
        LEARNING_ADVISOR_API_KEY: "dedicated",
        LEARNING_ADVISOR_MODEL: "gemini-3.6-flash",
      },
      fetcher: async (url, options) => {
        sent = { url, options };
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                finishReason: "STOP",
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        inScope: true,
                        reply: "Ôn tập",
                        tasks: [],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        };
      },
    },
  );
  assert.equal(sent.options.headers["x-goog-api-key"], "dedicated");
  assert.ok(!sent.url.includes("dedicated"));
  assert.equal(result.reply, "Ôn tập");
  await advise({ mode: 'chat', message: 'Toán', context: {}, history: [] }, {
    env: { GEMINI_API_KEY: 'shared-fixture', GEMINI_MODEL: 'gemini-3.6-flash' },
    fetcher: async (url, options) => {
      assert.equal(options.headers['x-goog-api-key'], 'shared-fixture');
      return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ inScope: true, reply: 'Học tập', tasks: [] }) }] } }] }) };
    }
  });
  assert.throws(() =>
    validateAdvice({ inScope: true, reply: "x", tasks: [{ day: 0 }] }),
  );
  await assert.rejects(
    advise(
      {},
      {
        env: {
          LEARNING_ADVISOR_API_KEY: "key",
          LEARNING_ADVISOR_MODEL: "gemini-3.6-flash",
        },
        fetcher: async () => ({ ok: false, status: 429 }),
      },
    ),
    /giới hạn/,
  );
});
test("advisor database, authorization, persistence, isolation and rate limiting", async (t) => {
  const f = await testDatabase({ memoryOnly: true }),
    db = f.db;
  t.after(() => f.close());
  for (const id of [1, 2])
    await db.query(
      "INSERT INTO users(id,name,email,password_hash) VALUES($1,'Student',$2,'hash')",
      [id, `s${id}@test.local`],
    );
  const school = (
    await db.query(
      "INSERT INTO schools(code,name) VALUES('ADVISOR','Test') RETURNING id",
    )
  ).rows[0];
  await db.query(
    "INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,1,'student')",
    [school.id],
  );
  await db.query(
    "INSERT INTO user_progress(user_id,item_type,item_id,subject,progress_percent) VALUES(1,'lesson','lesson-1','Toán',10)",
  );
  await db.query(
    "UPDATE user_progress SET progress_percent=20 WHERE user_id=1",
  );
  await db.query("UPDATE user_progress SET last_position='2' WHERE user_id=1");
  assert.equal(
    (await db.query("SELECT count(*) AS n FROM learning_activity_events"))
      .rows[0].n,
    2,
  );
  await db.query(
    "INSERT INTO exam_attempts(user_id,document_id,title,subject,grade,category,graded,score,scale,answers_json,answer_key_json,result_json) VALUES(1,'d1','Exam','Toán','10','exam',1,8,10,'{}','{}','{}'),(2,'d1','Exam','Toán','10','exam',1,1,10,'{}','{}','{}')",
  );
  const data = await snapshot(db, 1, "learning", null, 30);
  assert.equal(data.observations, 1);
  assert.equal(data.radar[0].percent, 80);
  assert.equal(
    (await snapshot(db, 1, "school", school.id, 30)).observations,
    0,
  );
  const app = express();
  app.use(express.json());
  let generated = 0;
  app.use((req, res, next) => {
    req.user = req.headers["x-user"]
      ? { id: Number(req.headers["x-user"]), role: "user" }
      : null;
    next();
  });
  const auth = (req, res, next) => (req.user ? next() : res.sendStatus(401));
  installLearningAdvisor(app, {
    db,
    requireAuth: auth,
    requireSameOrigin: (req, res, next) =>
      req.headers["x-origin"] === "bad" ? res.sendStatus(403) : next(),
    enabled: () => true,
    generate: async ({ message, mode }) => {
      generated++;
      return {
        inScope: message !== "outside",
        reply: "Kế hoạch học Toán",
        tasks:
          mode === "plan"
            ? [
                {
                  day: 1,
                  title: "Làm 5 câu, kiểm tra lỗi sai",
                  subject: "Toán",
                  minutes: 30,
                },
              ]
            : [],
      };
    },
  });
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/learning-advisor`;
  async function call(path = "", body, user = 1, extra = {}) {
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(user ? { "x-user": String(user) } : {}),
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      data: await response.json().catch(() => null),
    };
  }
  assert.equal((await call("/?scope=learning", null, null)).status, 401);
  assert.equal(
    (await call(`/?scope=school&schoolId=${school.id}`, null, 2)).status,
    403,
  );
  assert.equal((await call("/?scope=learning")).data.data.observations, 1);
  const body = {
    mode: "plan",
    message: "Lập kế hoạch",
    goal: "8 điểm Toán",
    minutes: 45,
  };
  assert.equal(
    (await call("/chat?scope=learning", body, 1, { "x-origin": "bad" })).status,
    403,
  );
  const plan = await call("/chat?scope=learning", body);
  assert.equal(plan.status, 200);
  const id = plan.data.roadmap.id;
  assert.equal(
    (await call(`/roadmaps/${id}?scope=learning`, { action: "apply" }, 2))
      .status,
    404,
  );
  assert.equal(
    (
      await call(`/roadmaps/${id}?scope=school&schoolId=${school.id}`, {
        action: "apply",
      })
    ).status,
    404,
  );
  assert.equal(
    (await call("/chat?scope=learning", { ...body, mode: "evaluate" })).status,
    400,
  );
  assert.equal(
    (await call(`/roadmaps/${id}?scope=learning`, { action: "apply" })).status,
    200,
  );
  const changed = await call(`/roadmaps/${id}?scope=learning`, {
    action: "task",
    index: 0,
    done: true,
  });
  assert.equal(changed.data.roadmap.plan.tasks[0].done, true);
  assert.equal(
    (await call("/chat?scope=learning", { ...body, mode: "evaluate" })).status,
    200,
  );
  const outside = await call("/chat?scope=learning", {
    ...body,
    message: "outside",
  });
  assert.equal(outside.data.roadmap, null);
  assert.match(outside.data.reply, /chỉ hỗ trợ học tập/);
  const persisted = await call("/?scope=learning");
  assert.equal(persisted.data.messages.length, 6);
  assert.equal(persisted.data.roadmaps[0].plan.tasks[0].done, true);
  assert.equal(
    (await call(`/?scope=school&schoolId=${school.id}`)).data.messages.length,
    0,
  );
  // A legacy active exam blocks all AI modes, including ordinary chat.
  await db.query(
    "INSERT INTO documents(id,subject,grade,category,title,original_name,filename,size) VALUES('examdoc','Toán','10','test','Test','test.pdf','test.pdf',1)",
  );
  await db.query(
    "INSERT INTO tests(id,document_id,title,subject,grade,created_by,open_at,close_at,duration_minutes) VALUES('active','examdoc','Test','Toán','10',1,now()::text,(now()+interval '1 day')::text,60)",
  );
  await db.query(
    "INSERT INTO legacy_test_sessions(id,test_id,user_id,started_at,deadline_at) VALUES('11111111-1111-4111-8111-111111111111','active',1,now(),now()+interval '1 hour')",
  );
  assert.equal(
    (await call("/chat?scope=learning", { ...body, mode: "chat" })).status,
    403,
  );
  await db.query("DELETE FROM legacy_test_sessions");
  await db.query(
    "INSERT INTO learning_advisor_calls(id,user_id) SELECT md5(i::text)::uuid,1 FROM generate_series(1,20) AS i",
  );
  const before = generated;
  assert.equal((await call("/chat?scope=learning", body)).status, 429);
  assert.equal(generated, before);
});
