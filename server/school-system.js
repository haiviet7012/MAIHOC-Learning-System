import crypto from "node:crypto";

export const SCHOOL_CLASSES = [
  ...Array.from({ length: 9 }, (_, i) => `10A${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `11B${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `12C${i + 1}`)
];

const CLASS_SET = new Set(SCHOOL_CLASSES);
const isClassCode = value => CLASS_SET.has(String(value || "").trim());
const parseJsonArray = value => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export async function initSchoolSystemDatabase(db) {
  try {
    await db.exec("ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'external'");
  } catch {
    // The column already exists on upgraded deployments.
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
}

export async function saveTeacherAssignments(db, teacherId, profile = {}) {
  const teacherKind = profile.teacherKind === "homeroom" ? "homeroom" : "subject";
  const subjects = [...new Set((Array.isArray(profile.subjects) ? profile.subjects : [])
    .map(value => String(value || "").trim()).filter(Boolean))].slice(0, 20);
  const teachingClasses = [...new Set((Array.isArray(profile.teachingClasses) ? profile.teachingClasses : [])
    .map(value => String(value || "").trim()).filter(isClassCode))];
  const homeroomClass = String(profile.homeroomClass || "").trim();

  if (!subjects.length) throw new Error("Giáo viên cần được phân công ít nhất một bộ môn.");
  if (!teachingClasses.length && teacherKind !== "homeroom") {
    throw new Error("Vui lòng chọn ít nhất một lớp giáo viên sẽ giảng dạy.");
  }
  if (teacherKind === "homeroom" && !isClassCode(homeroomClass)) {
    throw new Error("Vui lòng chọn lớp chủ nhiệm hợp lệ.");
  }

  if (teacherKind === "homeroom") {
    const occupied = await db.prepare(
      "SELECT teacher_id FROM school_teacher_assignments WHERE class_code=? AND assignment_type='homeroom' AND teacher_id<>?"
    ).get(homeroomClass, teacherId);
    if (occupied) throw new Error(`Lớp ${homeroomClass} đã có giáo viên chủ nhiệm.`);
  }

  await db.prepare("DELETE FROM school_teacher_assignments WHERE teacher_id=?").run(teacherId);
  const insert = db.prepare(
    "INSERT INTO school_teacher_assignments(id,teacher_id,class_code,subject,assignment_type) VALUES(?,?,?,?,?)"
  );
  if (teacherKind === "homeroom") {
    await insert.run(crypto.randomUUID(), teacherId, homeroomClass, "Chủ nhiệm", "homeroom");
  }

  const classesToTeach = teachingClasses.length
    ? teachingClasses
    : (teacherKind === "homeroom" ? [homeroomClass] : []);
  if (teacherKind === "homeroom" && !classesToTeach.includes(homeroomClass)) {
    classesToTeach.push(homeroomClass);
  }
  for (const classCode of classesToTeach) {
    for (const subject of subjects) {
      await insert.run(crypto.randomUUID(), teacherId, classCode, subject, "subject");
    }
  }

  await db.prepare("UPDATE users SET account_type='school' WHERE id=?").run(teacherId);
  return { teacherKind, homeroomClass: teacherKind === "homeroom" ? homeroomClass : null, subjects, teachingClasses: classesToTeach };
}

export function installSchoolSystemRoutes(app, deps) {
  const { db, requireAuth, requireSameOrigin, requireSuperAdmin, notifyUser, notifyAdmins } = deps;

  async function accountType(userId) {
    const row = await db.prepare("SELECT account_type FROM users WHERE id=?").get(userId);
    return String(row?.account_type || "external");
  }

  async function canAccessClass(user, classCode) {
    if (!isClassCode(classCode)) return false;
    if (user?.role === "admin" && Number(user.adminLevel) >= 2) return true;
    if (await accountType(user.id) !== "school") return false;
    if (user.role === "admin") {
      return Boolean(await db.prepare(
        "SELECT id FROM school_teacher_assignments WHERE teacher_id=? AND class_code=? LIMIT 1"
      ).get(user.id, classCode));
    }
    return Boolean(await db.prepare(
      "SELECT user_id FROM school_class_members WHERE user_id=? AND class_code=?"
    ).get(user.id, classCode));
  }

  async function requireHomeroom(req, res, classCode) {
    if (req.user?.role === "admin" && Number(req.user.adminLevel) >= 2) return true;
    if (req.user?.role !== "admin" || Number(req.user.adminLevel) < 1 ||
        await accountType(req.user.id) !== "school") {
      res.status(403).json({ error: "Chỉ giáo viên chủ nhiệm lớp này mới được thực hiện thao tác." });
      return false;
    }
    const assigned = await db.prepare(
      "SELECT id FROM school_teacher_assignments WHERE teacher_id=? AND class_code=? AND assignment_type='homeroom' LIMIT 1"
    ).get(req.user.id, classCode);
    if (!assigned) {
      res.status(403).json({ error: "Bạn không phải giáo viên chủ nhiệm của lớp này." });
      return false;
    }
    return true;
  }

  app.get("/api/school/classes", requireAuth, async (req, res) => {
    const isSuper = req.user.role === "admin" && Number(req.user.adminLevel) >= 2;
    if (!isSuper && await accountType(req.user.id) !== "school") {
      return res.status(403).json({ error: "Tính năng lớp học chỉ dành cho học sinh và giáo viên của trường." });
    }
    let classes = [];
    if (isSuper) {
      classes = SCHOOL_CLASSES.map(classCode => ({ classCode, role: "admin", isHomeroom: false }));
    } else if (req.user.role === "admin") {
      classes = await db.prepare(`
        SELECT class_code AS classCode,
          MAX(CASE WHEN assignment_type='homeroom' THEN 1 ELSE 0 END) AS isHomeroom,
          'teacher' AS role
        FROM school_teacher_assignments WHERE teacher_id=?
        GROUP BY class_code
        ORDER BY MAX(CASE WHEN assignment_type='homeroom' THEN 0 ELSE 1 END), class_code
      `).all(req.user.id);
    } else {
      classes = await db.prepare(
        "SELECT class_code AS classCode,'student' AS role,0 AS isHomeroom FROM school_class_members WHERE user_id=? ORDER BY class_code"
      ).all(req.user.id);
    }
    const formatted = [];
    for (const item of classes) {
      const count = await db.prepare("SELECT COUNT(*) AS total FROM school_class_members WHERE class_code=?").get(item.classCode);
      const homeroom = await db.prepare(`
        SELECT u.name FROM school_teacher_assignments a JOIN users u ON u.id=a.teacher_id
        WHERE a.class_code=? AND a.assignment_type='homeroom' LIMIT 1
      `).get(item.classCode);
      formatted.push({ ...item, studentCount: Number(count?.total || 0), homeroomTeacher: homeroom?.name || null });
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ classes: formatted, allClasses: isSuper });
  });

  app.get("/api/school/classes/:classCode", requireAuth, async (req, res) => {
    const classCode = String(req.params.classCode || "").toUpperCase();
    if (!await canAccessClass(req.user, classCode)) {
      return res.status(403).json({ error: "Bạn không có quyền xem lớp này." });
    }
    const assignments = await db.prepare(`
      SELECT u.id,u.name,a.subject,a.assignment_type AS assignmentType
      FROM school_teacher_assignments a JOIN users u ON u.id=a.teacher_id
      WHERE a.class_code=? ORDER BY CASE WHEN a.assignment_type='homeroom' THEN 0 ELSE 1 END,u.name
    `).all(classCode);
    const teacherMap = new Map();
    for (const row of assignments) {
      if (!teacherMap.has(Number(row.id))) teacherMap.set(Number(row.id), {
        id: Number(row.id), name: row.name, isHomeroom: false, subjects: []
      });
      const teacher = teacherMap.get(Number(row.id));
      if (row.assignmentType === "homeroom") teacher.isHomeroom = true;
      else if (row.subject && !teacher.subjects.includes(row.subject)) teacher.subjects.push(row.subject);
    }
    const students = await db.prepare(`
      SELECT u.id,u.name,u.email FROM school_class_members m
      JOIN users u ON u.id=m.user_id WHERE m.class_code=? ORDER BY u.name
    `).all(classCode);
    const canManageMembers = await requireHomeroom(req, { status: () => ({ json: () => {} }) }, classCode).catch(() => false);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ classCode, canManageMembers: Boolean(canManageMembers), teachers: [...teacherMap.values()].sort((a,b) => Number(b.isHomeroom)-Number(a.isHomeroom)), students: students.map(s => ({ id:Number(s.id),name:s.name,email:s.email })) });
  });

  app.get("/api/school/classes/:classCode/students/:studentId/progress", requireAuth, async (req, res) => {
    const classCode = String(req.params.classCode || "").toUpperCase();
    const studentId = Number(req.params.studentId);
    if (!Number.isInteger(studentId) || !await canAccessClass(req.user, classCode)) {
      return res.status(403).json({ error: "Bạn không có quyền xem tiến trình học sinh này." });
    }
    if (req.user.role !== "admin" || Number(req.user.adminLevel) < 2) {
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
    const target = await db.prepare("SELECT id,name,account_type FROM users WHERE LOWER(email)=?").get(email);
    if (!target || target.account_type !== "school") {
      return res.status(404).json({ error: "Không tìm thấy tài khoản học sinh của trường với email này." });
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

  app.get("/api/school/admin/class-change-requests", requireAuth, requireSuperAdmin, async (req, res) => {
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
    if (req.user.role !== "admin" || Number(req.user.adminLevel) < 1 || await accountType(req.user.id) !== "school") {
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

  app.get("/api/school/admin/teacher-messages", requireAuth, requireSuperAdmin, async (req, res) => {
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
