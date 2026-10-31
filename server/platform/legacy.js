import { randomUUID } from "node:crypto";
import {
  classPermission,
  cleanAnswers,
  date,
  deadlineFor,
  fail,
  integer,
  superAdmin,
} from "./policy.js";
const enabled = () => process.env.MAIHOC_PLATFORM_ENABLED === "1";
const get = async (db, sql, args) => (await db.query(sql, args)).rows[0];
export async function assertLegacyTestAccess(
  db,
  user,
  test,
  { checkTime = true } = {},
) {
  if (superAdmin(user) || String(test.created_by) === String(user.id)) return;
  const code = String(test.class_code || "").toUpperCase();
  if (code) {
    const members = await db
      .prepare("SELECT class_code FROM school_class_members WHERE user_id=?")
      .all(user.id);
    const valid =
      code === "ALL"
        ? members.some(
            (m) => String(m.class_code).slice(0, 2) === String(test.grade),
          )
        : members.some((m) => String(m.class_code).toUpperCase() === code);
    if (!valid) fail("Bài kiểm tra không được giao cho lớp của bạn.", 403);
  }
  if (checkTime) {
    const now = Date.now();
    if (now < date(test.open_at, "Mở bài").getTime())
      fail("Bài kiểm tra chưa mở.", 403);
    if (now > date(test.close_at, "Đóng bài").getTime())
      fail("Bài kiểm tra đã đóng.", 403);
  }
}
export function installLegacySessions(
  app,
  { db, requireAuth, requireSameOrigin },
) {
  const wrap = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res)).catch((error) =>
      res.status(error.status || 500).json({
        error: error.status ? error.message : "Không thể xử lý phiên làm bài.",
      }),
    );
  // The old single-school model is fenced once users belong exclusively to a new school.
  // Use middleware with next explicitly (the helper above is only for terminal handlers).
  app.use(
    ["/api/school", "/api/tests", "/api/test-submissions"],
    (req, res, next) => {
      if (!enabled() || !req.user || superAdmin(req.user)) return next();
      Promise.resolve()
        .then(async () => {
          const config = await get(
            db,
            "SELECT value FROM platform_settings WHERE name='legacy_school_id'",
            [],
          );
          if (!config) return;
          const unmapped = await get(
            db,
            "SELECT e.id FROM student_enrollments e WHERE e.school_id=$1 AND e.student_id=$2 AND e.status='active' AND NOT EXISTS(SELECT 1 FROM legacy_class_mappings m WHERE m.class_id=e.class_id) LIMIT 1",
            [config.value, req.user.id],
          );
          if (unmapped)
            fail(
              "Lớp mới cần sử dụng không gian School mới để phân biệt trường và năm học.",
              409,
            );
          const m = (
            await db.query(
              "SELECT school_id FROM school_memberships WHERE user_id=$1 AND status='active'",
              [req.user.id],
            )
          ).rows;
          if (m.length && !m.some((x) => String(x.school_id) === config.value))
            fail(
              "Chức năng này thuộc trường cũ. Hãy dùng không gian School mới.",
              403,
            );
        })
        .then(() => next())
        .catch((error) =>
          res.status(error.status || 500).json({ error: error.message }),
        );
    },
  );
  app.post(
    "/api/tests/:id/session",
    requireSameOrigin,
    requireAuth,
    wrap(async (req, res) => {
      if (!enabled())
        return res.status(503).json({
          error: "Phiên làm bài phía server chưa được bật.",
          enabled: false,
        });
      const test = await db
        .prepare("SELECT * FROM tests WHERE id=?")
        .get(req.params.id);
      if (!test) fail("Không có bài kiểm tra.", 404);
      await assertLegacyTestAccess(db, req.user, test);
      const now = new Date(),
        duration = Number(test.duration_minutes) || 240;
      await db.query(
        "INSERT INTO legacy_test_sessions(id,test_id,user_id,started_at,deadline_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(test_id,user_id) DO NOTHING",
        [
          randomUUID(),
          test.id,
          req.user.id,
          now,
          deadlineFor(now, test.close_at, duration),
        ],
      );
      const session = await get(
        db,
        "SELECT * FROM legacy_test_sessions WHERE test_id=$1 AND user_id=$2",
        [test.id, req.user.id],
      );
      res.json({ session, serverNow: new Date().toISOString() });
    }),
  );
  app.patch(
    "/api/tests/:id/session",
    requireSameOrigin,
    requireAuth,
    wrap(async (req, res) => {
      if (!enabled()) fail("Phiên làm bài chưa bật.", 503);
      const answers = cleanAnswers(req.body.answers),
        version = integer(req.body.version, "Phiên bản", 0);
      const result = await db.transaction(async () => {
        const test = await db
          .prepare("SELECT * FROM tests WHERE id=?")
          .get(req.params.id);
        if (!test) fail("Không có bài kiểm tra.", 404);
        await assertLegacyTestAccess(db, req.user, test);
        const session = await get(
          db,
          "SELECT * FROM legacy_test_sessions WHERE test_id=$1 AND user_id=$2 FOR UPDATE",
          [test.id, req.user.id],
        );
        if (
          !session ||
          session.submission_id ||
          new Date() > new Date(session.deadline_at)
        )
          fail("Phiên đã đóng.", 409);
        if (session.version !== version)
          fail("Có bản nháp mới hơn trên máy chủ. Mở lại bài để đồng bộ.", 409);
        return get(
          db,
          "UPDATE legacy_test_sessions SET answers=$2,version=version+1 WHERE id=$1 RETURNING version",
          [session.id, JSON.stringify(answers)],
        );
      })();
      res.json(result);
    }),
  );
  // Security checks also cover old clients; visibility in the UI is not authorization.
  app.post(
    "/api/tests/:id/submit",
    requireSameOrigin,
    requireAuth,
    (req, res, next) => {
      Promise.resolve()
        .then(async () => {
          const test = await db
            .prepare("SELECT * FROM tests WHERE id=?")
            .get(req.params.id);
          if (!test) fail("Không có bài kiểm tra.", 404);
          const session = enabled()
            ? await get(
                db,
                "SELECT * FROM legacy_test_sessions WHERE test_id=$1 AND user_id=$2",
                [test.id, req.user.id],
              )
            : null;
          await assertLegacyTestAccess(db, req.user, test, {
            checkTime: !session,
          });
          if (enabled() && !session)
            fail("Hãy mở lại bài để tạo phiên làm bài an toàn.", 409);
          if (session?.submission_id) {
            const result = await db
              .prepare(
                "SELECT result_json FROM test_submissions WHERE id=? AND user_id=?",
              )
              .get(session.submission_id, req.user.id);
            res.json(JSON.parse(result.result_json));
            return;
          }
          if (session && new Date() > new Date(session.deadline_at))
            req.body.answers = session.answers;
          req.legacySession = session;
        })
        .then(() => {
          if (!res.headersSent) next();
        })
        .catch((error) =>
          res.status(error.status || 500).json({
            error: error.status
              ? error.message
              : "Không thể kiểm tra lượt nộp.",
          }),
        );
    },
  );
}
