export const superAdmin = (user) =>
  user?.role === "admin" && Number(user.adminLevel ?? user.admin_level) >= 2;
export function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
export function text(value, label, max = 500) {
  const s = String(value ?? "").trim();
  if (!s || s.length > max) fail(`${label} không hợp lệ.`);
  return s;
}
export function integer(value, label, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    fail(`${label} không hợp lệ.`);
  return n;
}
export function date(value, label) {
  const d = new Date(value);
  if (!value || !Number.isFinite(d.getTime())) fail(`${label} không hợp lệ.`);
  return d;
}
export function cleanAnswers(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Đáp án không hợp lệ.");
  const entries = Object.entries(value);
  if (entries.length > 250) fail("Quá nhiều câu trả lời.");
  return Object.fromEntries(
    entries.map(([k, v]) => {
      if (
        k.length > 80 ||
        typeof v === "object" ||
        String(v ?? "").length > 5000
      )
        fail("Câu trả lời không hợp lệ.");
      return [k, String(v ?? "")];
    }),
  );
}
export function deadlineFor(start, close, duration) {
  return new Date(
    Math.min(
      new Date(close).getTime(),
      new Date(start).getTime() + duration * 60000,
    ),
  );
}
export function assertAttemptOwner(attempt, user) {
  if (String(attempt.student_id ?? attempt.user_id) !== String(user.id))
    fail("Bạn không có quyền truy cập bài làm này.", 403);
}
export async function membership(db, user, schoolId, roles = []) {
  const school = (
    await db.query("SELECT id FROM schools WHERE id=$1 AND status='active'", [
      schoolId,
    ])
  ).rows[0];
  if (!school) fail("Không tìm thấy trường.", 404);
  if (superAdmin(user)) return { role: "school_admin" };
  const member = (
    await db.query(
      "SELECT role FROM school_memberships WHERE school_id=$1 AND user_id=$2 AND status='active'",
      [schoolId, user.id],
    )
  ).rows[0];
  if (!member || (roles.length && !roles.includes(member.role)))
    fail("Bạn không có quyền trong trường này.", 403);
  return member;
}
export async function classPermission(
  db,
  user,
  schoolId,
  classId,
  { teach = false, subject } = {},
) {
  const member = await membership(db, user, schoolId);
  if (member.role === "school_admin") return member;
  if (member.role === "teacher") {
    const assigned = (
      await db.query(
        `SELECT id FROM teacher_course_assignments WHERE school_id=$1 AND teacher_id=$2 AND class_id=$3 ${subject ? "AND (subject=$4 OR kind='homeroom')" : ""} LIMIT 1`,
        subject
          ? [schoolId, user.id, classId, subject]
          : [schoolId, user.id, classId],
      )
    ).rows[0];
    if (assigned) return member;
  } else if (
    !teach &&
    (
      await db.query(
        "SELECT id FROM student_enrollments WHERE school_id=$1 AND student_id=$2 AND class_id=$3 AND status='active'",
        [schoolId, user.id, classId],
      )
    ).rows[0]
  )
    return member;
  fail("Bạn không được phân công hoặc ghi danh trong lớp này.", 403);
}
export async function audit(
  db,
  user,
  schoolId,
  action,
  entity,
  id,
  detail = {},
) {
  await db.query(
    "INSERT INTO audit_logs(school_id,actor_id,action,entity_type,entity_id,detail) VALUES($1,$2,$3,$4,$5,$6)",
    [schoolId, user.id, action, entity, String(id), JSON.stringify(detail)],
  );
}

export async function hasActiveExam(db, userId) {
  const result = await db.query(
    `SELECT a.id FROM assessment_attempts a JOIN assessment_assignments assignment ON assignment.id=a.assignment_id WHERE a.student_id=$1 AND a.status='in_progress' AND a.deadline_at>now() AND NOT assignment.is_practice UNION ALL SELECT NULL::bigint FROM legacy_test_sessions WHERE user_id=$1 AND submission_id IS NULL AND deadline_at>now() LIMIT 1`,
    [userId],
  );
  return result.rows.length > 0;
}
