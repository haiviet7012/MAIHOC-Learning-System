import { randomUUID } from "node:crypto";
// Isolated local preview; never reads DATABASE_URL or production data.
delete process.env.DATABASE_URL;
delete process.env.MAIHOC_TEST_DATABASE_URL;
process.env.MAIHOC_SKIP_AUTO_LISTEN = "1";
process.env.MAIHOC_PLATFORM_ENABLED = process.env.MAIHOC_PREVIEW_PLATFORM_ENABLED ?? "1";
process.env.MAIHOC_AI_WORKER_ENABLED = "0";
process.env.NODE_ENV = "test";
for (const key of [
  "R2_ACCOUNT_ID",
  "R2_BUCKET_NAME",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
])
  process.env[key] = "local-preview";
const { testDatabase } = await import("../server/platform/test-db.js");
const { setTestPool } = await import("../server/postgres.js");
const fixture = await testDatabase();
setTestPool(fixture.pool);
const { hashPassword } = await import("../server/auth.js");
const { app, server, initializeApplicationRuntime, stopPresenceCleanup } =
  await import("../server/server.js");
await initializeApplicationRuntime();
const hash = await hashPassword(process.env.MAIHOC_PREVIEW_PASSWORD || randomUUID());
for (const [id, name, email, role, level] of [
  [100, "Nguyễn Minh Anh", "student@maihoc.test", "user", 0],
  [101, "Thầy Hải Việt", "teacher@maihoc.test", "admin", 1],
  [102, "Quản trị MAIHOC", "admin@maihoc.test", "admin", 2],
])
  await fixture.db.query(
    "INSERT INTO users(id,name,email,password_hash,role,admin_level,account_type) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [id, name, email, hash, role, level, "school"],
  );
const school = (
  await fixture.db.query(
    "INSERT INTO schools(code,name) VALUES('PREVIEW','Trường THPT MAIHOC · Kiểm thử') RETURNING id",
  )
).rows[0];
for (const [id, role] of [
  [100, "student"],
  [101, "teacher"],
  [102, "school_admin"],
])
  await fixture.db.query(
    "INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,$2,$3)",
    [school.id, id, role],
  );
const year = (
  await fixture.db.query(
    "INSERT INTO academic_years(school_id,code,start_date,end_date) VALUES($1,'2026–2027','2026-08-01','2027-07-31') RETURNING id",
    [school.id],
  )
).rows[0];
const cls = (
  await fixture.db.query(
    "INSERT INTO classes(school_id,academic_year_id,class_code,name,grade_level) VALUES($1,$2,'12A1','Lớp 12A1',12) RETURNING id",
    [school.id, year.id],
  )
).rows[0];
await fixture.db.query(
  "INSERT INTO student_enrollments(school_id,academic_year_id,class_id,student_id,reason,approved_by) VALUES($1,$2,$3,100,'Preview',102)",
  [school.id, year.id, cls.id],
);
await fixture.db.query(
  "INSERT INTO teacher_course_assignments(school_id,class_id,teacher_id,subject,kind) VALUES($1,$2,101,'Toán','subject')",
  [school.id, cls.id],
);
await fixture.db.query(
  "INSERT INTO school_class_members(user_id,class_code) VALUES(100,'12C1')",
);
await fixture.db.query(
  "INSERT INTO notifications(user_id,type,title,message) VALUES(100,'learning','Chào mừng đến lớp học','Hãy bắt đầu với học liệu và bài được giao.'),(100,'learning','Kiến thức luôn được kết nối','Theo dõi tiến trình sau mỗi bài làm.')",
);
// The existing server exposes static files, APIs, real cookies, grading and Socket.IO.
const port = Number(process.env.PREVIEW_PORT || 4173);
server.listen(port, "127.0.0.1", () =>
  console.log(`MAIHOC isolated preview ready on http://127.0.0.1:${port}`),
);
async function stop() {
  stopPresenceCleanup();
  await new Promise((r) => server.close(r));
  await fixture.close();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
