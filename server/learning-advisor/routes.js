import express from "express";
import { randomUUID } from "node:crypto";
import {
  membership,
  hasActiveExam,
  integer,
  text,
  fail,
} from "../platform/policy.js";
import { snapshot } from "./analytics.js";
import { advise } from "./gemini.js";
export function installLearningAdvisor(
  app,
  {
    db,
    requireAuth,
    requireSameOrigin,
    generate = advise,
    enabled = () => process.env.MAIHOC_LEARNING_ADVISOR_ENABLED !== "0",
  },
) {
  const router = express.Router(),
    wrap = (fn) => (req, res, next) =>
      Promise.resolve(fn(req, res)).catch(next);
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  router.use(requireAuth, (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  router.use((req, res, next) =>
    enabled()
      ? next()
      : res.status(503).json({ error: "Cố vấn học tập chưa được bật." }),
  );
  router.use((req, res, next) =>
    Promise.resolve()
      .then(async () => {
        const schema = await rows("SELECT to_regclass('public.learning_advisor_threads') AS ready");
        if (!schema[0]?.ready) fail("Cơ sở dữ liệu Cố vấn chưa được cập nhật. Quản trị viên cần chạy npm run db:migrate trên backend.", 503);
      }).then(() => next()).catch(next),
  );
  router.use((req, res, next) =>
    Promise.resolve()
      .then(async () => {
        const scope = req.query.scope;
        if (!["learning", "school"].includes(scope))
          fail("Phạm vi không hợp lệ.");
        const schoolId =
          scope === "school" ? integer(req.query.schoolId, "Trường") : null;
        if (scope === "school") {
          const member = await membership(db, req.user, schoolId, ["student"]);
          if (member.role !== "student")
            fail(
              "Cố vấn cá nhân dành cho học sinh. Giáo viên xem thống kê School hiện có.",
              403,
            );
        }
        req.advisor = {
          scope,
          schoolId,
          days: integer(req.query.days || 30, "Số ngày", 1, 90),
        };
        next();
      })
      .catch(next),
  );
  const threadFor = async (req) => {
    const { scope, schoolId } = req.advisor;
    return (
      await rows(
        "SELECT id FROM learning_advisor_threads WHERE user_id=$1 AND scope=$2 AND school_id IS NOT DISTINCT FROM $3::bigint ORDER BY created_at DESC LIMIT 1",
        [req.user.id, scope, schoolId],
      )
    )[0];
  };
  const plans = async (thread) =>
    thread
      ? rows(
          `SELECT id,plan,applied_at,created_at FROM learning_advisor_roadmaps WHERE id IN (SELECT id FROM learning_advisor_roadmaps WHERE thread_id=$1 ORDER BY created_at DESC LIMIT 10) OR id IN (SELECT id FROM learning_advisor_roadmaps WHERE thread_id=$1 AND applied_at IS NOT NULL ORDER BY applied_at DESC LIMIT 1) ORDER BY created_at DESC`,
          [thread.id],
        )
      : [];
  router.get(
    "/",
    wrap(async (req, res) => {
      const { scope, schoolId, days } = req.advisor;
      const data = await snapshot(db, req.user.id, scope, schoolId, days),
        thread = await threadFor(req);
      const messages = thread
        ? (
            await rows(
              "SELECT role,content FROM learning_advisor_messages WHERE thread_id=$1 ORDER BY id DESC LIMIT 20",
              [thread.id],
            )
          ).reverse()
        : [];
      res.json({
        data,
        messages,
        roadmaps: await plans(thread),
        aiConfigured: Boolean(
          (process.env.LEARNING_ADVISOR_API_KEY || process.env.GEMINI_API_KEY) &&
          (process.env.LEARNING_ADVISOR_MODEL || process.env.GEMINI_MODEL),
        ),
      });
    }),
  );
  router.use(requireSameOrigin);
  router.post(
    "/chat",
    wrap(async (req, res) => {
      if (await hasActiveExam(db, req.user.id))
        fail("Cố vấn AI tạm dừng khi bạn đang làm bài kiểm tra.", 403);
      const mode = req.body.mode;
      if (!["plan", "evaluate", "charts", "chat"].includes(mode))
        fail("Chế độ không hợp lệ.");
      const message = text(req.body.message, "Tin nhắn", 4000),
        goal = String(req.body.goal || "").trim();
      if (goal.length > 500) fail("Mục tiêu quá dài.");
      const minutes = integer(
        req.body.minutes || 45,
        "Phút học mỗi ngày",
        10,
        240,
      );
      const { scope, schoolId, days } = req.advisor;
      const thread = await db.transaction(async () => {
        await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          req.user.id,
        ]);
        const counts = (
          await rows(
            `SELECT count(*) FILTER(WHERE created_at>now()-interval '1 hour') AS hour,count(*) AS day FROM learning_advisor_calls WHERE user_id=$1 AND created_at>now()-interval '1 day'`,
            [req.user.id],
          )
        )[0];
        if (Number(counts.hour) >= 20 || Number(counts.day) >= 100)
          fail(
            "Đã đạt giới hạn Cố vấn học tập (20 lượt/giờ, 100 lượt/ngày).",
            429,
          );
        await db.query(
          "INSERT INTO learning_advisor_calls(id,user_id) VALUES($1,$2)",
          [randomUUID(), req.user.id],
        );
        let thread = await threadFor(req);
        if (!thread)
          thread = (
            await rows(
              "INSERT INTO learning_advisor_threads(id,user_id,scope,school_id) VALUES($1,$2,$3,$4) RETURNING id",
              [randomUUID(), req.user.id, scope, schoolId],
            )
          )[0];
        return thread;
      })();
      const applied =
        (
          await rows(
            "SELECT plan,applied_at FROM learning_advisor_roadmaps WHERE thread_id=$1 AND applied_at IS NOT NULL ORDER BY applied_at DESC LIMIT 1",
            [thread.id],
          )
        )[0] || null;
      if (mode === "evaluate" && !applied)
        fail(
          "Bạn chưa áp dụng lộ trình nào. Hãy thiết kế và áp dụng lộ trình trước.",
        );
      const history = (
        await rows(
          "SELECT role,content FROM learning_advisor_messages WHERE thread_id=$1 ORDER BY id DESC LIMIT 12",
          [thread.id],
        )
      ).reverse();
      const context = await snapshot(db, req.user.id, scope, schoolId, days);
      const answer = await generate({
        mode,
        message,
        context,
        history,
        roadmap: applied,
        goal,
        minutes,
      });
      // Even a provider implementation must pass server-side structural validation.
      const { validateAdvice } = await import("./gemini.js");
      const checked = validateAdvice(answer);
      if (!checked.inScope) {
        checked.reply =
          "Mình chỉ hỗ trợ học tập và các vấn đề của học sinh liên quan đến việc học. Bạn muốn ôn môn nào hoặc điều chỉnh kế hoạch học tập?";
        checked.tasks = [];
      }
      if (mode !== "plan") checked.tasks = [];
      const totals = new Map();
      for (const task of checked.tasks)
        totals.set(task.day, (totals.get(task.day) || 0) + task.minutes);
      if ([...totals.values()].some((total) => total > minutes))
        fail(
          "Lộ trình vượt thời gian học mỗi ngày. Hãy yêu cầu AI chia nhỏ nhiệm vụ.",
          502,
        );
      const roadmap = await db.transaction(async () => {
        await db.query(
          "INSERT INTO learning_advisor_messages(thread_id,role,content) VALUES($1,'user',$2),($1,'model',$3)",
          [thread.id, message, checked.reply],
        );
        if (!checked.tasks.length) return null;
        const plan = {
          goal,
          minutesPerDay: minutes,
          tasks: checked.tasks,
          basedOn: context.generatedAt,
          summary: checked.reply,
        };
        return (
          await rows(
            "INSERT INTO learning_advisor_roadmaps(id,thread_id,plan) VALUES($1,$2,$3) RETURNING id,plan,applied_at,created_at",
            [randomUUID(), thread.id, JSON.stringify(plan)],
          )
        )[0];
      })();
      res.json({ reply: checked.reply, roadmap });
    }),
  );
  router.post(
    "/roadmaps/:id",
    wrap(async (req, res) => {
      const thread = await threadFor(req);
      if (!thread || !/^[a-f0-9-]{36}$/.test(req.params.id))
        fail("Không tìm thấy lộ trình.", 404);
      const result = await db.transaction(async () => {
        const roadmap = (
          await rows(
            "SELECT * FROM learning_advisor_roadmaps WHERE id=$1 AND thread_id=$2 FOR UPDATE",
            [req.params.id, thread.id],
          )
        )[0];
        if (!roadmap) fail("Không tìm thấy lộ trình.", 404);
        if (req.body.action === "apply") {
          await db.query(
            "SELECT id FROM learning_advisor_threads WHERE id=$1 FOR UPDATE",
            [thread.id],
          );
          if (!roadmap.applied_at)
            await db.query(
              "UPDATE learning_advisor_roadmaps SET applied_at=clock_timestamp() WHERE id=$1",
              [roadmap.id],
            );
        } else if (req.body.action === "task") {
          if (!roadmap.applied_at) fail("Hãy áp dụng lộ trình trước.");
          const index = integer(
            req.body.index,
            "Nhiệm vụ",
            0,
            roadmap.plan.tasks.length - 1,
          );
          if (typeof req.body.done !== "boolean")
            fail("Trạng thái không hợp lệ.");
          roadmap.plan.tasks[index].done = req.body.done;
          await db.query(
            "UPDATE learning_advisor_roadmaps SET plan=$2 WHERE id=$1",
            [roadmap.id, JSON.stringify(roadmap.plan)],
          );
        } else fail("Thao tác không hợp lệ.");
        return (
          await rows(
            "SELECT id,plan,applied_at,created_at FROM learning_advisor_roadmaps WHERE id=$1",
            [roadmap.id],
          )
        )[0];
      })();
      res.json({ roadmap: result });
    }),
  );
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const missing = ["42P01", "42883"].includes(error.pgCode || error.code);
    const status = error.status || (missing ? 503 : 500);
    res.status(status).json({
      error: error.status
        ? error.message
        : missing
          ? "Cần chạy migration Cố vấn học tập trước khi bật tính năng."
          : "Không xử lý được Cố vấn học tập. Vui lòng thử lại.",
    });
  });
  app.use("/api/learning-advisor", router);
}
