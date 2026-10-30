import crypto from "node:crypto";
import { publicUser, isSuperAdminUser, isTeacherUser } from "./auth.js";

export const SCHOOL_CLASSES = [
  ...Array.from({ length: 9 }, (_, i) => `10A${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `11B${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `12C${i + 1}`)
];

const CLASS_SET = new Set(SCHOOL_CLASSES);
const isClassCode = value => CLASS_SET.has(String(value || "").trim().toUpperCase());

export async function initSchoolSystemDatabase(db) {
  try {
    await db.exec("ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'external'");
  } catch {
    // Column already exists on upgraded deployments.
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS school_class_members (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_code TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, class_code)
    );

    CREATE INDEX IF NOT EXISTS school_class_members_class_idx
      ON school_class_members(class_code, user_id);

    CREATE TABLE IF NOT EXISTS school_class_join_locks (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      class_code TEXT NOT NULL,
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO school_class_join_locks(user_id,class_code,joined_at)
    SELECT user_id,class_code,created_at FROM school_class_members
    ON CONFLICT(user_id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS school_class_leave_requests (
      id TEXT PRIMARY KEY,
      class_code TEXT NOT NULL,
      student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT,
      reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS school_class_leave_requests_class_idx
      ON school_class_leave_requests(class_code,status,created_at);

    CREATE UNIQUE INDEX IF NOT EXISTS school_class_leave_requests_pending_idx
      ON school_class_leave_requests(student_id,class_code) WHERE status='pending';

    CREATE TABLE IF NOT EXISTS school_teacher_assignments (
      id TEXT PRIMARY KEY,
      teacher_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_code TEXT NOT NULL,
      subject TEXT NOT NULL,
      assignment_type TEXT NOT NULL CHECK(assignment_type IN ('homeroom','subject')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS school_teacher_assignments_class_idx
      ON school_teacher_assignments(class_code, teacher_id);

    CREATE TABLE IF NOT EXISTS school_document_reviews (
      submission_id BIGINT PRIMARY KEY REFERENCES document_submissions(id) ON DELETE CASCADE,
      class_code TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS school_class_change_requests (
      id TEXT PRIMARY KEY,
      class_code TEXT NOT NULL,
      target_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK(action IN ('add','remove')),
      requested_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT,
      reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS school_teacher_messages (
      id TEXT PRIMARY KEY,
      teacher_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','read')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      read_at TEXT
    );

    CREATE INDEX IF NOT EXISTS school_teacher_messages_status_idx
      ON school_teacher_messages(status, created_at DESC);
  `);

  try {
    await db.prepare(`
      UPDATE users SET account_type='school'
      WHERE account_type <> 'school'
        AND (
          EXISTS (SELECT 1 FROM school_class_members m WHERE m.user_id = users.id)
          OR EXISTS (SELECT 1 FROM school_teacher_assignments a WHERE a.teacher_id = users.id)
        )
    `).run();
  } catch {
    // Ignore backfill errors on minimal test schemas.
  }
}

export async function validateTeacherProfile(db, profile = {}, excludeTeacherId = null) {
  const teacherKind = profile.teacherKind === "homeroom" ? "homeroom" : "subject";
  const subjects = [...new Set((Array.isArray(profile.subjects) ? profile.subjects : [])
    .map(value => String(value || "").trim()).filter(Boolean))].slice(0, 20);
  const teachingClasses = [...new Set((Array.isArray(profile.teachingClasses) ? profile.teachingClasses : [])
    .map(value => String(value || "").trim().toUpperCase()).filter(isClassCode))];
  const homeroomClass = String(profile.homeroomClass || "").trim().toUpperCase();

  if (teacherKind === "homeroom") {
    if (!isClassCode(homeroomClass)) {
      throw new Error("Vui lòng chọn lớp chủ nhiệm hợp lệ (10A1–12C9).");
    }
    const occupied = excludeTeacherId != null
      ? await db.prepare(
          "SELECT teacher_id FROM school_teacher_assignments WHERE class_code=? AND assignment_type='homeroom' AND teacher_id<>?"
        ).get(homeroomClass, excludeTeacherId)
      : await db.prepare(
          "SELECT teacher_id FROM school_teacher_assignments WHERE class_code=? AND assignment_type='homeroom'"
        ).get(homeroomClass);
    if (occupied) {
      throw new Error(`Lớp ${homeroomClass} đã có giáo viên chủ nhiệm.`);
    }
  } else {
    if (!subjects.length) {
      throw new Error("Giáo viên bộ môn cần được phân công ít nhất một bộ môn.");
    }
    if (!teachingClasses.length) {
      throw new Error("Vui lòng chọn ít nhất một lớp giáo viên sẽ giảng dạy.");
    }
  }

  return { teacherKind, homeroomClass: teacherKind === "homeroom" ? homeroomClass : null, subjects, teachingClasses };
}

export async function saveTeacherAssignments(db, teacherId, profile = {}) {
  const validated = await validateTeacherProfile(db, profile, teacherId);
  const { teacherKind, homeroomClass, subjects, teachingClasses } = validated;

  await db.prepare("DELETE FROM school_teacher_assignments WHERE teacher_id=?").run(teacherId);
  const insert = db.prepare(
    "INSERT INTO school_teacher_assignments(id,teacher_id,class_code,subject,assignment_type) VALUES(?,?,?,?,?)"
  );
  if (teacherKind === "homeroom" && homeroomClass) {
    await insert.run(crypto.randomUUID(), teacherId, homeroomClass, "Chủ nhiệm", "homeroom");
  }

  const classesToTeach = teachingClasses.length
    ? [...teachingClasses]
    : (teacherKind === "homeroom" && homeroomClass ? [homeroomClass] : []);
  if (teacherKind === "homeroom" && homeroomClass && !classesToTeach.includes(homeroomClass)) {
    classesToTeach.push(homeroomClass);
  }
  for (const classCode of classesToTeach) {
    for (const subject of subjects) {
      await insert.run(crypto.randomUUID(), teacherId, classCode, subject, "subject");
    }
  }

  await db.prepare("UPDATE users SET account_type='school' WHERE id=?").run(teacherId);
  return {
    teacherKind,
    homeroomClass: teacherKind === "homeroom" ? homeroomClass : null,
    subjects,
    teachingClasses: classesToTeach
  };
}

export function installSchoolSystemRoutes(app, deps) {
  const { db, requireAuth, requireSameOrigin, requireSuperAdmin, notifyUser, notifyAdmins } = deps;

  async function canAccessClass(user, classCode) {
    const normalized = String(classCode || "").trim().toUpperCase();
    if (!isClassCode(normalized) || !user) return false;
    if (isSuperAdminUser(user)) return true;
    if (isTeacherUser(user)) {
      return Boolean(await db.prepare(
        "SELECT id FROM school_teacher_assignments WHERE teacher_id=? AND class_code=? LIMIT 1"
      ).get(user.id, normalized));
    }
    return Boolean(await db.prepare(
      "SELECT user_id FROM school_class_members WHERE user_id=? AND class_code=?"
    ).get(user.id, normalized));
  }

  async function isHomeroomTeacherOfClass(user, classCode) {
    const normalized = String(classCode || "").trim().toUpperCase();
    if (!user || !isClassCode(normalized)) return false;
    if (isSuperAdminUser(user)) return true;
    if (!isTeacherUser(user)) return false;
    const assigned = await db.prepare(
      "SELECT id FROM school_teacher_assignments WHERE teacher_id=? AND class_code=? AND assignment_type='homeroom' LIMIT 1"
    ).get(user.id, normalized);
    return Boolean(assigned);
  }

  async function requireHomeroom(req, res, classCode) {
    if (await isHomeroomTeacherOfClass(req.user, classCode)) return true;
    res.status(403).json({ error: "Chỉ giáo viên chủ nhiệm của lớp này mới được thực hiện thao tác." });
    return false;
  }

  async function buildClassDetailPayload(user, rawClassCode) {
    const classCode = String(rawClassCode || "").trim().toUpperCase();
    const assignments = await db.prepare(`
      SELECT u.id,u.name,u.email,a.subject,a.assignment_type AS assignmentType
      FROM school_teacher_assignments a JOIN users u ON u.id=a.teacher_id
      WHERE a.class_code=? ORDER BY CASE WHEN a.assignment_type='homeroom' THEN 0 ELSE 1 END,u.name
    `).all(classCode);
    const teacherMap = new Map();
    for (const row of assignments) {
      if (!teacherMap.has(Number(row.id))) {
        teacherMap.set(Number(row.id), {
          id: Number(row.id),
          name: row.name,
          email: row.email,
          isHomeroom: false,
          subjects: []
        });
      }
      const teacher = teacherMap.get(Number(row.id));
      if (row.assignmentType === "homeroom") teacher.isHomeroom = true;
      else if (row.subject && !teacher.subjects.includes(row.subject)) teacher.subjects.push(row.subject);
    }
    const students = await db.prepare(`
      SELECT u.id,u.name,u.email,m.created_at AS joinedAt
      FROM school_class_members m
      JOIN users u ON u.id=m.user_id
      WHERE m.class_code=?
      ORDER BY u.name, u.id
    `).all(classCode);
    const canManageMembers = await isHomeroomTeacherOfClass(user, classCode);
    const isHomeroomTeacher = Boolean(
      isTeacherUser(user) &&
      assignments.some(row => Number(row.id) === Number(user.id) && row.assignmentType === "homeroom")
    );
    const leaveRequests = canManageMembers ? await db.prepare(`
      SELECT r.id,r.class_code AS classCode,r.created_at AS createdAt,
        u.id AS studentId,u.name AS studentName,u.email AS studentEmail
      FROM school_class_leave_requests r
      JOIN users u ON u.id=r.student_id
      WHERE r.class_code=? AND r.status='pending'
      ORDER BY r.created_at,r.id
    `).all(classCode) : [];
    const leaveRequest = !isSuperAdminUser(user) && !isTeacherUser(user)
      ? await db.prepare(`
          SELECT id,status,created_at AS createdAt
          FROM school_class_leave_requests
          WHERE student_id=? AND class_code=?
          ORDER BY created_at DESC LIMIT 1
        `).get(user.id, classCode)
      : null;
    return {
      classCode,
      canManageMembers,
      isHomeroomTeacher,
      leaveRequests,
      leaveRequest: leaveRequest || null,
      teachers: [...teacherMap.values()].sort((a, b) => Number(b.isHomeroom) - Number(a.isHomeroom)),
      students: students.map(s => ({
        id: Number(s.id),
        name: s.name,
        email: s.email,
        joinedAt: s.joinedAt || null
      }))
    };
  }

  app.get("/api/school/classes", requireAuth, async (req, res) => {
    const isSuper = isSuperAdminUser(req.user);
    const isTeacher = isTeacherUser(req.user);

    const [countRows, homeroomRows] = await Promise.all([
      db.prepare("SELECT class_code AS classCode, COUNT(*) AS total FROM school_class_members GROUP BY class_code").all(),
      db.prepare(`
        SELECT a.class_code AS classCode, u.id AS teacherId, u.name AS teacherName
        FROM school_teacher_assignments a
        JOIN users u ON u.id=a.teacher_id
        WHERE a.assignment_type='homeroom'
      `).all()
    ]);

    const countByClass = new Map(countRows.map(r => [String(r.classCode).toUpperCase(), Number(r.total || 0)]));
    const homeroomByClass = new Map(homeroomRows.map(r => [String(r.classCode).toUpperCase(), r.teacherName || null]));

    const availableClasses = SCHOOL_CLASSES.map(classCode => ({
      classCode,
      studentCount: countByClass.get(classCode) || 0,
      homeroomTeacher: homeroomByClass.get(classCode) || null
    }));

    let classes = [];
    if (isSuper) {
      classes = SCHOOL_CLASSES.map(classCode => ({ classCode, role: "admin", isHomeroom: false }));
    } else if (isTeacher) {
      const assignedRows = await db.prepare(`
        SELECT class_code AS classCode,
          MAX(CASE WHEN assignment_type='homeroom' THEN 1 ELSE 0 END) AS isHomeroom
        FROM school_teacher_assignments WHERE teacher_id=?
        GROUP BY class_code
        ORDER BY MAX(CASE WHEN assignment_type='homeroom' THEN 0 ELSE 1 END), class_code
      `).all(req.user.id);
      classes = assignedRows.map(row => ({
        classCode: String(row.classCode).toUpperCase(),
        isHomeroom: Boolean(Number(row.isHomeroom)),
        role: "teacher"
      }));
    } else {
      const memberRows = await db.prepare(
        "SELECT class_code AS classCode FROM school_class_members WHERE user_id=? ORDER BY class_code"
      ).all(req.user.id);
      classes = memberRows.map(row => ({
        classCode: String(row.classCode).toUpperCase(),
        isHomeroom: false,
        role: "student"
      }));
    }

    const formatted = classes.map(item => ({
      ...item,
      studentCount: countByClass.get(item.classCode) || 0,
      homeroomTeacher: homeroomByClass.get(item.classCode) || null
    }));

    let homeroomDetail = null;
    const homeroomItem = formatted.find(item => item.isHomeroom);
    if (homeroomItem) {
      homeroomDetail = await buildClassDetailPayload(req.user, homeroomItem.classCode);
    }

    let studentClassDetail = null;
    if (!isSuper && !isTeacher && formatted.length > 0) {
      studentClassDetail = await buildClassDetailPayload(req.user, formatted[0].classCode);
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      classes: formatted,
      availableClasses,
      allClasses: isSuper,
      homeroomClass: homeroomItem?.classCode || null,
      homeroomDetail,
      currentClassCode: !isSuper && !isTeacher && formatted.length > 0 ? formatted[0].classCode : null,
      studentClassDetail
    });
  });

  app.get("/api/school/classes/:classCode", requireAuth, async (req, res) => {
    const classCode = String(req.params.classCode || "").trim().toUpperCase();
    if (!await canAccessClass(req.user, classCode)) {
      return res.status(403).json({ error: "Bạn không có quyền xem lớp này." });
    }
    const payload = await buildClassDetailPayload(req.user, classCode);
    res.setHeader("Cache-Control", "private, no-store");
    res.json(payload);
  });

  // Giáo viên chủ nhiệm thêm trực tiếp học sinh vào lớp bằng email học sinh (Ảnh 1)
  app.post("/api/school/classes/:classCode/students", requireSameOrigin, requireAuth, async (req, res) => {
    const classCode = String(req.params.classCode || "").trim().toUpperCase();
    if (!isClassCode(classCode)) {
      return res.status(400).json({ error: "Mã lớp không hợp lệ." });
    }
    if (!await requireHomeroom(req, res, classCode)) return;

    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Vui lòng nhập địa chỉ email học sinh hợp lệ." });
    }

    const target = await db
      .prepare("SELECT id,name,email,role,admin_level,account_type FROM users WHERE LOWER(email)=?")
      .get(email);
    if (!target) {
      return res.status(404).json({ error: "Không tìm thấy tài khoản học sinh với email này. Học sinh cần đăng ký tài khoản trước." });
    }
    if (target.role === "admin" || target.role === "teacher" || Number(target.admin_level) >= 1) {
      return res.status(400).json({ error: "Email này thuộc tài khoản Giáo viên / Quản trị, không phải tài khoản học sinh." });
    }

    const alreadyMember = await db
      .prepare("SELECT user_id FROM school_class_members WHERE user_id=? AND class_code=?")
      .get(target.id, classCode);
    if (alreadyMember) {
      return res.status(409).json({ error: `Học sinh ${target.name} (${target.email}) đã có trong danh sách lớp ${classCode}.` });
    }
    const previousClass = await db
      .prepare("SELECT class_code FROM school_class_members WHERE user_id=? LIMIT 1")
      .get(target.id);
    const joinLock = await db
      .prepare("SELECT class_code FROM school_class_join_locks WHERE user_id=?")
      .get(target.id);
    if (previousClass || joinLock) {
      return res.status(409).json({
        error: joinLock?.class_code
          ? `Học sinh đã được ghi nhận tham gia lớp ${joinLock.class_code}; không thể thêm sang lớp khác.`
          : "Học sinh đã thuộc một lớp khác."
      });
    }

    const addTx = db.transaction(async () => {
      await db.prepare("INSERT INTO school_class_join_locks(user_id,class_code) VALUES(?,?)").run(target.id, classCode);
      await db.prepare("UPDATE users SET account_type='school' WHERE id=?").run(target.id);
      await db.prepare("INSERT INTO school_class_members(user_id,class_code) VALUES(?,?)").run(target.id, classCode);
    });
    try {
      await addTx();
    } catch (error) {
      if (error?.pgCode === "23505" || error?.code === "23505" || /constraint|unique/i.test(String(error?.code || ""))) {
        return res.status(409).json({ error: "Học sinh đã được ghi nhận tham gia một lớp trước đó." });
      }
      throw error;
    }

    await notifyUser?.(
      target.id,
      "school_class_membership",
      `Đã được thêm vào lớp ${classCode}`,
      `Giáo viên chủ nhiệm ${req.user.name} đã thêm bạn vào lớp ${classCode}.`,
      "/"
    );

    return res.status(201).json({
      ok: true,
      classCode,
      student: {
        id: Number(target.id),
        name: target.name,
        email: target.email
      },
      message: `Đã thêm học sinh ${target.name} (${target.email}) vào lớp ${classCode}.`
    });
  });

  // Giáo viên chủ nhiệm xóa học sinh khỏi lớp chủ nhiệm
  app.delete("/api/school/classes/:classCode/students/:studentId", requireSameOrigin, requireAuth, async (req, res) => {
    const classCode = String(req.params.classCode || "").trim().toUpperCase();
    const studentId = Number(req.params.studentId);
    if (!isClassCode(classCode) || !Number.isInteger(studentId) || studentId < 1) {
      return res.status(400).json({ error: "Thông tin lớp hoặc học sinh không hợp lệ." });
    }
    if (!await requireHomeroom(req, res, classCode)) return;

    const existing = await db
      .prepare("SELECT user_id FROM school_class_members WHERE user_id=? AND class_code=?")
      .get(studentId, classCode);
    if (!existing) {
      return res.status(404).json({ error: "Học sinh không thuộc lớp này." });
    }

    await db.prepare("DELETE FROM school_class_members WHERE user_id=? AND class_code=?").run(studentId, classCode);
    await notifyUser?.(
      studentId,
      "school_class_membership",
      `Cập nhật lớp học ${classCode}`,
      `Bạn đã được giáo viên chủ nhiệm chuyển khỏi danh sách lớp ${classCode}.`,
      "/"
    );
    return res.json({ ok: true, classCode, removedStudentId: studentId });
  });

  // Học sinh của trường chọn lớp một lần duy nhất; lịch sử được giữ kể cả khi rời lớp.
  app.post("/api/school/join-class", requireSameOrigin, requireAuth, async (req, res) => {
    if (isSuperAdminUser(req.user) || isTeacherUser(req.user)) {
      return res.status(403).json({ error: "Chức năng tham gia lớp chỉ dành cho tài khoản Học sinh." });
    }
    const classCode = String(req.body?.classCode || "").trim().toUpperCase();
    if (!isClassCode(classCode)) {
      return res.status(400).json({ error: "Vui lòng chọn lớp hợp lệ (từ 10A1 đến 12C9)." });
    }

    const joinLock = await db.prepare(
      "SELECT class_code FROM school_class_join_locks WHERE user_id=?"
    ).get(req.user.id);
    const currentMembership = await db.prepare(
      "SELECT class_code FROM school_class_members WHERE user_id=? LIMIT 1"
    ).get(req.user.id);
    if (joinLock || currentMembership) {
      const joinedClass = joinLock?.class_code || currentMembership?.class_code;
      return res.status(409).json({
        error: joinedClass
          ? `Bạn đã tham gia Lớp ${joinedClass}. Mỗi tài khoản chỉ được chọn lớp một lần; hãy liên hệ giáo viên chủ nhiệm nếu cần hỗ trợ.`
          : "Tài khoản này đã tham gia lớp học trước đó và không thể tham gia lần thứ hai."
      });
    }

    const joinTx = db.transaction(async () => {
      await db.prepare("INSERT INTO school_class_join_locks(user_id,class_code) VALUES(?,?)").run(req.user.id, classCode);
      await db.prepare("UPDATE users SET account_type='school' WHERE id=?").run(req.user.id);
      await db.prepare("INSERT INTO school_class_members(user_id,class_code) VALUES(?,?)").run(req.user.id, classCode);
    });
    try {
      await joinTx();
    } catch (error) {
      if (error?.pgCode === "23505" || error?.code === "23505" || /constraint|unique/i.test(String(error?.code || ""))) {
        return res.status(409).json({ error: "Tài khoản này đã được ghi nhận tham gia một lớp trước đó." });
      }
      throw error;
    }

    const homeroom = await db.prepare(`
      SELECT a.teacher_id AS teacherId, u.name AS teacherName
      FROM school_teacher_assignments a
      JOIN users u ON u.id=a.teacher_id
      WHERE a.class_code=? AND a.assignment_type='homeroom'
      LIMIT 1
    `).get(classCode);

    if (homeroom?.teacherId) {
      await notifyUser?.(
        homeroom.teacherId,
        "student_joined_class",
        `Học sinh mới vào lớp ${classCode}`,
        `Học sinh ${req.user.name} (${req.user.email}) vừa tham gia lớp ${classCode} của bạn.`,
        "/"
      );
    }

    const updatedRow = await db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
    const updatedUser = publicUser({
      ...updatedRow,
      account_type: "school",
      student_class: classCode
    });

    return res.json({
      ok: true,
      classCode,
      homeroomTeacher: homeroom?.teacherName || null,
      user: updatedUser,
      message: `Đã tham gia Lớp ${classCode} thành công!`
    });
  });

  // Học sinh gửi yêu cầu rời lớp; membership chỉ bị xóa khi GVCN chấp thuận.
  app.post("/api/school/classes/:classCode/leave-requests", requireSameOrigin, requireAuth, async (req, res) => {
    const classCode = String(req.params.classCode || "").trim().toUpperCase();
    if (!isClassCode(classCode)) return res.status(400).json({ error: "Mã lớp không hợp lệ." });
    if (isSuperAdminUser(req.user) || isTeacherUser(req.user)) {
      return res.status(403).json({ error: "Chỉ học sinh mới có thể gửi yêu cầu rời lớp." });
    }

    const membership = await db.prepare(
      "SELECT user_id FROM school_class_members WHERE user_id=? AND class_code=?"
    ).get(req.user.id, classCode);
    if (!membership) return res.status(404).json({ error: "Bạn không còn là thành viên của lớp này." });

    const existingPending = await db.prepare(
      "SELECT id FROM school_class_leave_requests WHERE student_id=? AND class_code=? AND status='pending' LIMIT 1"
    ).get(req.user.id, classCode);
    if (existingPending) return res.status(409).json({ error: "Yêu cầu rời lớp của bạn đang chờ giáo viên duyệt." });

    const homeroom = await db.prepare(`
      SELECT a.teacher_id AS teacherId
      FROM school_teacher_assignments a
      WHERE a.class_code=? AND a.assignment_type='homeroom'
      LIMIT 1
    `).get(classCode);
    if (!homeroom?.teacherId) {
      return res.status(409).json({ error: "Lớp chưa có giáo viên chủ nhiệm để duyệt yêu cầu rời lớp." });
    }

    const id = crypto.randomUUID();
    try {
      await db.prepare(
        "INSERT INTO school_class_leave_requests(id,class_code,student_id) VALUES(?,?,?)"
      ).run(id, classCode, req.user.id);
    } catch (error) {
      if (error?.pgCode === "23505" || error?.code === "23505" || /constraint|unique/i.test(String(error?.code || ""))) {
        return res.status(409).json({ error: "Yêu cầu rời lớp của bạn đang chờ giáo viên duyệt." });
      }
      throw error;
    }

    await notifyUser?.(
      homeroom.teacherId,
      "school_class_leave_request",
      `Yêu cầu rời lớp ${classCode}`,
      `Học sinh ${req.user.name} (${req.user.email}) đã gửi yêu cầu rời lớp. Vui lòng mở lớp để duyệt.`,
      "/"
    );
    return res.status(201).json({ ok: true, id, message: "Đã gửi yêu cầu rời lớp. Hãy chờ giáo viên chủ nhiệm duyệt." });
  });

  app.post("/api/school/classes/:classCode/leave-requests/:requestId/review", requireSameOrigin, requireAuth, async (req, res) => {
    const classCode = String(req.params.classCode || "").trim().toUpperCase();
    const requestId = String(req.params.requestId || "");
    const decision = String(req.body?.decision || "");
    if (!isClassCode(classCode) || !requestId) return res.status(400).json({ error: "Thông tin yêu cầu không hợp lệ." });
    if (!["approve", "reject"].includes(decision)) return res.status(400).json({ error: "Quyết định không hợp lệ." });
    if (!await requireHomeroom(req, res, classCode)) return;

    const leaveRequest = await db.prepare(
      "SELECT id,student_id AS studentId FROM school_class_leave_requests WHERE id=? AND class_code=? AND status='pending'"
    ).get(requestId, classCode);
    if (!leaveRequest) return res.status(404).json({ error: "Yêu cầu không tồn tại hoặc đã được xử lý." });

    if (decision === "approve") {
      const membership = await db.prepare(
        "SELECT user_id FROM school_class_members WHERE user_id=? AND class_code=?"
      ).get(leaveRequest.studentId, classCode);
      if (!membership) return res.status(409).json({ error: "Học sinh không còn thuộc lớp này." });
    }

    await db.transaction(async () => {
      if (decision === "approve") {
        await db.prepare("DELETE FROM school_class_members WHERE user_id=? AND class_code=?")
          .run(leaveRequest.studentId, classCode);
      }
      await db.prepare(`
        UPDATE school_class_leave_requests
        SET status=?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=?
        WHERE id=? AND status='pending'
      `).run(decision === "approve" ? "approved" : "rejected", req.user.id, requestId);
    })();

    await notifyUser?.(
      leaveRequest.studentId,
      "school_class_leave_request",
      decision === "approve" ? `Đã duyệt rời lớp ${classCode}` : `Chưa duyệt yêu cầu rời lớp ${classCode}`,
      decision === "approve"
        ? `Giáo viên chủ nhiệm đã chấp thuận yêu cầu rời lớp ${classCode}. Lịch sử tham gia vẫn được lưu nên bạn không thể tự đăng ký lớp khác.`
        : `Giáo viên chủ nhiệm chưa chấp thuận yêu cầu rời lớp ${classCode}. Bạn vẫn là thành viên của lớp.`,
      "/"
    );
    return res.json({ ok: true, decision, classCode, studentId: Number(leaveRequest.studentId) });
  });

  app.get("/api/school/classes/:classCode/students/:studentId/progress", requireAuth, async (req, res) => {
    const classCode = String(req.params.classCode || "").toUpperCase();
    const studentId = Number(req.params.studentId);
    if (!Number.isInteger(studentId) || !await canAccessClass(req.user, classCode)) {
      return res.status(403).json({ error: "Bạn không có quyền xem tiến trình học sinh này." });
    }
    if (!isSuperAdminUser(req.user)) {
      const assigned = await db.prepare(
        "SELECT id FROM school_teacher_assignments WHERE teacher_id=? AND class_code=? LIMIT 1"
      ).get(req.user.id, classCode);
      if (!assigned) return res.status(403).json({ error: "Chỉ giáo viên được phân công lớp này mới xem được tiến trình." });
    }
    const member = await db.prepare(
      "SELECT user_id FROM school_class_members WHERE user_id=? AND class_code=?"
    ).get(studentId, classCode);
    if (!member) return res.status(404).json({ error: "Học sinh không thuộc lớp này." });
    const progress = await db.prepare(`
      SELECT item_type AS itemType,item_title AS itemTitle,subject,grade,status,
        progress_percent AS progressPercent,score,updated_at AS updatedAt
      FROM user_progress WHERE user_id=? ORDER BY updated_at DESC LIMIT 300
    `).all(studentId);
    res.json({ progress });
  });

  app.post("/api/school/classes/:classCode/change-requests", requireSameOrigin, requireAuth, async (req, res) => {
    const classCode = String(req.params.classCode || "").toUpperCase();
    if (!await requireHomeroom(req, res, classCode)) return;
    const action = String(req.body?.action || "");
    const email = String(req.body?.email || "").trim().toLowerCase();
    const note = String(req.body?.note || "").trim().slice(0, 500);
    if (!["add", "remove"].includes(action) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Vui lòng nhập email hợp lệ và chọn thao tác thêm/xóa." });
    }
    const target = await db.prepare("SELECT id,name,role,admin_level,account_type FROM users WHERE LOWER(email)=?").get(email);
    if (!target || target.role === "admin" || target.role === "teacher" || Number(target.admin_level) >= 1) {
      return res.status(404).json({ error: "Không tìm thấy tài khoản học sinh với email này." });
    }
    const alreadyMember = await db.prepare(
      "SELECT user_id FROM school_class_members WHERE user_id=? AND class_code=?"
    ).get(target.id, classCode);
    if ((action === "add" && alreadyMember) || (action === "remove" && !alreadyMember)) {
      return res.status(409).json({ error: action === "add" ? "Học sinh đã ở trong lớp." : "Học sinh không thuộc lớp này." });
    }
    const id = crypto.randomUUID();
    await db.prepare(
      "INSERT INTO school_class_change_requests(id,class_code,target_user_id,action,requested_by,note) VALUES(?,?,?,?,?,?)"
    ).run(id, classCode, target.id, action, req.user.id, note);
    await notifyAdmins?.("school_class_change", "Yêu cầu thay đổi thành viên lớp", `${req.user.name} đề nghị ${action === "add" ? "thêm" : "xóa"} ${target.name} khỏi lớp ${classCode}.`, "admin");
    res.status(201).json({ ok: true, id });
  });

  app.get("/api/school/admin/class-change-requests", requireAuth, async (req, res) => {
    if (!isSuperAdminUser(req.user)) {
      return res.status(403).json({ error: "Chỉ Quản trị viên (Admin) mới xem được yêu cầu này." });
    }
    const requests = await db.prepare(`
      SELECT r.id,r.class_code AS classCode,r.action,r.note,r.status,r.created_at AS createdAt,
        u.name AS studentName,u.email AS studentEmail,t.name AS teacherName
      FROM school_class_change_requests r
      JOIN users u ON u.id=r.target_user_id JOIN users t ON t.id=r.requested_by
      WHERE r.status='pending' ORDER BY r.created_at
    `).all();
    res.json({ requests });
  });

  app.post("/api/school/admin/class-change-requests/:id/review", requireSameOrigin, requireAuth, requireSuperAdmin, async (req, res) => {
    const id = String(req.params.id || "");
    const decision = String(req.body?.decision || "");
    if (!["approve", "reject"].includes(decision)) return res.status(400).json({ error: "Quyết định không hợp lệ." });
    const request = await db.prepare("SELECT * FROM school_class_change_requests WHERE id=? AND status='pending'").get(id);
    if (!request) return res.status(404).json({ error: "Yêu cầu không tồn tại hoặc đã xử lý." });
    if (decision === "approve") {
      if (request.action === "add") {
        const priorJoin = await db.prepare("SELECT class_code FROM school_class_join_locks WHERE user_id=?").get(request.target_user_id);
        const priorMember = await db.prepare("SELECT class_code FROM school_class_members WHERE user_id=? LIMIT 1").get(request.target_user_id);
        if ((priorJoin && priorJoin.class_code !== request.class_code) || (priorMember && priorMember.class_code !== request.class_code)) {
          return res.status(409).json({ error: "Học sinh đã được ghi nhận tham gia một lớp khác." });
        }
        await db.prepare("INSERT INTO school_class_join_locks(user_id,class_code) VALUES(?,?) ON CONFLICT(user_id) DO NOTHING")
          .run(request.target_user_id, request.class_code);
        await db.prepare("UPDATE users SET account_type='school' WHERE id=?").run(request.target_user_id);
        const existing = await db.prepare("SELECT user_id FROM school_class_members WHERE user_id=? AND class_code=?").get(request.target_user_id, request.class_code);
        if (!existing) await db.prepare("INSERT INTO school_class_members(user_id,class_code) VALUES(?,?)").run(request.target_user_id, request.class_code);
      } else {
        await db.prepare("DELETE FROM school_class_members WHERE user_id=? AND class_code=?").run(request.target_user_id, request.class_code);
      }
      await notifyUser?.(request.target_user_id, "school_class_membership", "Cập nhật thành viên lớp", `Yêu cầu thay đổi thành viên lớp ${request.class_code} đã được chấp thuận.`, "/");
    }
    await db.prepare("UPDATE school_class_change_requests SET status=?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=?")
      .run(decision === "approve" ? "approved" : "rejected", req.user.id, id);
    res.json({ ok: true });
  });

  app.post("/api/school/teacher-messages", requireSameOrigin, requireAuth, async (req, res) => {
    if (!isTeacherUser(req.user)) {
      return res.status(403).json({ error: "Chỉ giáo viên của trường mới gửi được thông báo." });
    }
    const title = String(req.body?.title || "").trim().slice(0, 120);
    const message = String(req.body?.message || "").trim().slice(0, 2000);
    if (!title || !message) return res.status(400).json({ error: "Vui lòng nhập tiêu đề và nội dung." });
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO school_teacher_messages(id,teacher_id,title,message) VALUES(?,?,?,?)").run(id, req.user.id, title, message);
    await notifyAdmins?.("teacher_message", "Thông báo từ giáo viên", `${req.user.name}: ${title}`, "admin");
    res.status(201).json({ ok: true, id });
  });

  app.get("/api/school/admin/teacher-messages", requireAuth, async (req, res) => {
    if (!isSuperAdminUser(req.user)) {
      return res.status(403).json({ error: "Chỉ Quản trị viên (Admin) mới xem được thông báo này." });
    }
    const messages = await db.prepare(`
      SELECT m.id,m.title,m.message,m.status,m.created_at AS createdAt,u.name AS teacherName
      FROM school_teacher_messages m JOIN users u ON u.id=m.teacher_id ORDER BY m.created_at DESC LIMIT 200
    `).all();
    res.json({ messages });
  });

  app.post("/api/school/admin/teacher-messages/:id/read", requireSameOrigin, requireAuth, requireSuperAdmin, async (req, res) => {
    await db.prepare("UPDATE school_teacher_messages SET status='read',read_at=CURRENT_TIMESTAMP WHERE id=?").run(String(req.params.id));
    res.json({ ok: true });
  });
}
